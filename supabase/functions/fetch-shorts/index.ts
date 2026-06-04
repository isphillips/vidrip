import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YOUTUBE_API_KEY     = Deno.env.get('YOUTUBE_API_KEY')!;
const INTERNAL_SECRET     = Deno.env.get('INTERNAL_SECRET')!;

const YT = 'https://www.googleapis.com/youtube/v3';

const CATEGORIES = [
  { name: 'trending',  q: '#Shorts trending'  },
  { name: 'music',     q: '#Shorts music'      },
  { name: 'gaming',    q: '#Shorts gaming'     },
  { name: 'funny',     q: '#Shorts funny'      },
  { name: 'food',      q: '#Shorts food'       },
  { name: 'sports',    q: '#Shorts sports'     },
  { name: 'dance',     q: '#Shorts dance'      },
  { name: 'comedy',    q: '#Shorts comedy'     },
];

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) { return 0; }
  return (parseInt(m[1] ?? '0') * 3600)
       + (parseInt(m[2] ?? '0') * 60)
       + (parseInt(m[3] ?? '0'));
}

async function searchCategory(category: string, q: string) {
  const url = `${YT}/search?part=id,snippet&type=video&videoDuration=short&maxResults=50&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[fetch-shorts] search failed for ${category}:`, await res.text());
    return [];
  }
  const data = await res.json();
  return (data.items ?? [])
    .filter((item: any) => item.id?.videoId)
    .map((item: any) => ({
      videoId:  item.id.videoId as string,
      title:    (item.snippet.title ?? '') as string,
      thumbnail:(item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.default?.url ?? '') as string,
      channel:  (item.snippet.channelTitle ?? '') as string,
      category,
    }));
}

async function verifyShorts(videoIds: string[]): Promise<Set<string>> {
  const verified = new Set<string>();
  // Batch parallel checks in groups of 20 to avoid rate limiting
  const BATCH = 20;
  for (let i = 0; i < videoIds.length; i += BATCH) {
    const chunk = videoIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      chunk.map(async (id) => {
        const res = await fetch(`https://www.youtube.com/shorts/${id}`, {
          method: 'HEAD',
          redirect: 'follow',
        });
        // If final URL still contains /shorts/ it's a real Short
        return { id, isShort: res.url.includes('/shorts/') };
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.isShort) {
        verified.add(r.value.id);
      }
    }
  }
  return verified;
}

async function getDurations(videoIds: string[]): Promise<Record<string, number>> {
  if (!videoIds.length) { return {}; }
  // Batch in chunks of 50 (API limit)
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }
  const result: Record<string, number> = {};
  for (const chunk of chunks) {
    const url = `${YT}/videos?part=contentDetails&id=${chunk.join(',')}&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) { continue; }
    const data = await res.json();
    for (const item of (data.items ?? [])) {
      result[item.id] = parseDuration(item.contentDetails?.duration ?? '');
    }
  }
  return result;
}

serve(async (req) => {
  if (req.headers.get('x-internal-secret') !== INTERNAL_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let totalUpserted = 0;

  for (const { name, q } of CATEGORIES) {
    try {
      const candidates = await searchCategory(name, q);
      if (!candidates.length) { continue; }

      const ids = candidates.map((c: any) => c.videoId);
      const durations = await getDurations(ids);

      // Filter by duration first, then verify each is actually a Short (vertical)
      const durationFiltered = candidates
        .map((c: any) => ({ ...c, duration: durations[c.videoId] ?? 999 }))
        .filter((c: any) => c.duration > 0 && c.duration <= 60);

      const confirmedShortIds = await verifyShorts(durationFiltered.map((c: any) => c.videoId));
      console.log(`[fetch-shorts] ${name}: ${durationFiltered.length} ≤60s → ${confirmedShortIds.size} verified vertical`);

      const rows = durationFiltered
        .filter((c: any) => confirmedShortIds.has(c.videoId))
        .map((c: any) => ({
          video_id:   c.videoId,
          title:      c.title,
          thumbnail:  c.thumbnail,
          channel:    c.channel,
          duration:   c.duration,
          category:   c.category,
          fetched_at: new Date().toISOString(),
        }));

      if (rows.length) {
        const { error } = await db.from('shorts').upsert(rows, { onConflict: 'video_id' });
        if (error) { console.error(`[fetch-shorts] upsert error (${name}):`, error); }
        else { totalUpserted += rows.length; }
      }

      console.log(`[fetch-shorts] ${name}: ${candidates.length} candidates → ${rows.length} ≤60s`);
    } catch (e) {
      console.error(`[fetch-shorts] error for category ${name}:`, e);
    }
  }

  // Purge rows older than 7 days
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.from('shorts').delete().lt('fetched_at', cutoff);

  return new Response(JSON.stringify({ ok: true, upserted: totalUpserted }), {
    headers: { 'content-type': 'application/json' },
  });
});
