import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Category ingester. Uses YouTube's `videos.list?chart=mostPopular` (1 quota unit)
// instead of `search` (100 units) — and requests contentDetails inline so duration
// comes back in the same call (no separate videos.list). A run is ~9 units total vs
// ~900 before. mostPopular returns currently-trending videos per category; we filter
// to real Shorts (duration ≤180s + the /shorts/ HEAD check).
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY')!;
const INTERNAL_SECRET = Deno.env.get('INTERNAL_SECRET')!;

const YT = 'https://www.googleapis.com/youtube/v3';

const MAX_SHORT_DURATION = 180;

// videoCategoryId null = overall most-popular (trending); others map to YouTube's
// category ids. mostPopular accepts a videoCategoryId + regionCode.
const CATEGORIES = [
  { name: 'trending', videoCategoryId: null },
  { name: 'music', videoCategoryId: '10' },
  { name: 'gaming', videoCategoryId: '20' },
  { name: 'funny', videoCategoryId: '23' },
  { name: 'food', videoCategoryId: '26' },
  { name: 'sports', videoCategoryId: '17' },
  { name: 'news', videoCategoryId: '25' },
  { name: 'pets', videoCategoryId: '15' },
  { name: 'cars', videoCategoryId: '2' },
];

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return parseInt(m[1] ?? '0') * 3600 + parseInt(m[2] ?? '0') * 60 + parseInt(m[3] ?? '0');
}

function looksEnglish(text: string) {
  return /^[\x00-\x7F\s.,!?'"()\-:&%#@]+$/.test(text);
}

type Candidate = {
  videoId: string; title: string; thumbnail: string;
  channel: string; channelId: string; publishedAt: string | null;
  duration: number; category: string;
};

// One mostPopular call per category — returns snippet + contentDetails (duration)
// in a single 1-unit request. Pre-filters by duration + language; Shorts are
// confirmed separately via verifyShorts.
async function fetchPopular(category: string, videoCategoryId: string | null): Promise<Candidate[]> {
  const params = new URLSearchParams({
    part: 'snippet,contentDetails',
    chart: 'mostPopular',
    maxResults: '50',
    regionCode: 'US',
    key: YOUTUBE_API_KEY,
    ...(videoCategoryId ? { videoCategoryId } : {}),
  });
  const res = await fetch(`${YT}/videos?${params.toString()}`);
  if (!res.ok) {
    console.error(`[fetch-shorts] mostPopular failed for ${category}:`, await res.text());
    return [];
  }
  const data = await res.json();
  return (data.items ?? [])
    .map((item: any) => ({
      videoId: item.id as string,
      title: (item.snippet?.title ?? '') as string,
      thumbnail: (item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url ?? '') as string,
      channel: (item.snippet?.channelTitle ?? '') as string,
      channelId: (item.snippet?.channelId ?? '') as string,
      publishedAt: item.snippet?.publishedAt ?? null,
      duration: parseDuration(item.contentDetails?.duration ?? ''),
      category,
    }))
    .filter((v: Candidate) => v.videoId && looksEnglish(v.title))
    .filter((v: Candidate) => v.duration > 0 && v.duration <= MAX_SHORT_DURATION);
}

// mostPopular includes long videos; confirm each survivor is actually a Short
// (the /shorts/<id> URL doesn't redirect away). Free — no quota.
async function verifyShorts(videoIds: string[]): Promise<Set<string>> {
  const verified = new Set<string>();
  const BATCH = 30;
  for (let i = 0; i < videoIds.length; i += BATCH) {
    const chunk = videoIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      chunk.map(async (id) => {
        const res = await fetch(`https://www.youtube.com/shorts/${id}`, { method: 'HEAD', redirect: 'follow' });
        return { id, isShort: res.url.includes('/shorts/') };
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.isShort) { verified.add(r.value.id); }
    }
  }
  return verified;
}

serve(async (req) => {
  if (req.headers.get('x-internal-secret') !== INTERNAL_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let totalUpserted = 0;

  for (const { name, videoCategoryId } of CATEGORIES) {
    try {
      const candidates = await fetchPopular(name, videoCategoryId);
      if (!candidates.length) continue;

      const confirmed = await verifyShorts(candidates.map((c) => c.videoId));
      const rows = candidates
        .filter((c) => confirmed.has(c.videoId))
        .map((c) => ({
          video_id: c.videoId,
          title: c.title,
          thumbnail: c.thumbnail,
          channel: c.channel,
          channel_id: c.channelId,
          channel_country: null,
          duration: c.duration,
          category: c.category,
          published_at: c.publishedAt,
          fetched_at: new Date().toISOString(),
        }));

      if (rows.length) {
        const { error } = await db.from('shorts').upsert(rows, { onConflict: 'video_id' });
        if (error) { console.error(`[fetch-shorts] upsert error (${name}):`, error); }
        else { totalUpserted += rows.length; }
      }

      console.log(`[fetch-shorts] ${name}: ${candidates.length} ≤${MAX_SHORT_DURATION}s candidates → ${confirmed.size} verified Shorts → ${rows.length} inserted`);
    } catch (e) {
      console.error(`[fetch-shorts] error for category ${name}:`, e);
    }
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.from('shorts').delete().lt('fetched_at', cutoff);

  return new Response(JSON.stringify({ ok: true, upserted: totalUpserted }), {
    headers: { 'content-type': 'application/json' },
  });
});
