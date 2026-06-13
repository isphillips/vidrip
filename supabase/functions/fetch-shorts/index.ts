import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY')!;
const INTERNAL_SECRET = Deno.env.get('INTERNAL_SECRET')!;

const YT = 'https://www.googleapis.com/youtube/v3';

const HOURS_BACK = 24;
const MAX_SHORT_DURATION = 180;

const CATEGORIES = [
  { name: 'trending', q: 'shorts trending', videoCategoryId: null },
  { name: 'music', q: 'shorts', videoCategoryId: '10' },
  { name: 'gaming', q: 'shorts', videoCategoryId: '20' },
  { name: 'funny', q: 'shorts', videoCategoryId: '23' },
  { name: 'food', q: 'shorts', videoCategoryId: '26' },
  { name: 'sports', q: 'shorts', videoCategoryId: '17' },
  { name: 'news', q: 'shorts', videoCategoryId: '25' },
  { name: 'pets', q: 'shorts', videoCategoryId: '15' },
  { name: 'cars', q: 'shorts', videoCategoryId: '2' },
];

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;

  return (
    parseInt(m[1] ?? '0') * 3600 +
    parseInt(m[2] ?? '0') * 60 +
    parseInt(m[3] ?? '0')
  );
}

function looksEnglish(text: string) {
  return /^[\x00-\x7F\s.,!?'"()\-:&%#@]+$/.test(text);
}

async function searchCategory(category: string, q: string, videoCategoryId: string) {
  const publishedAfter = new Date(
    Date.now() - HOURS_BACK * 60 * 60 * 1000
  ).toISOString();

  const params = new URLSearchParams({
    part: 'id,snippet',
    type: 'video',
    videoDuration: 'short',
    maxResults: '50',
    key: YOUTUBE_API_KEY,
    q,
    regionCode: 'US',
    relevanceLanguage: 'en',
    order: 'date',
    publishedAfter,
    ...(videoCategoryId ? { videoCategoryId } : {})
  });

  const res = await fetch(`${YT}/search?${params.toString()}`);

  if (!res.ok) {
    console.error(`[fetch-shorts] search failed for ${category}:`, await res.text());
    return [];
  }

  const data = await res.json();

  return (data.items ?? [])
    .filter((item: any) => item.id?.videoId)
    .map((item: any) => ({
      videoId: item.id.videoId as string,
      title: (item.snippet.title ?? '') as string,
      thumbnail: (
        item.snippet.thumbnails?.high?.url ??
        item.snippet.thumbnails?.default?.url ??
        ''
      ) as string,
      channel: (item.snippet.channelTitle ?? '') as string,
      channelId: (item.snippet.channelId ?? '') as string,
      publishedAt: item.snippet.publishedAt ?? null,
      category,
    }))
    .filter((v: any) => looksEnglish(v.title));
}

async function getChannelCountries(
  channelIds: string[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const uniqueIds = [...new Set(channelIds.filter(Boolean))];

  for (let i = 0; i < uniqueIds.length; i += 50) {
    const chunk = uniqueIds.slice(i, i + 50);

    const params = new URLSearchParams({
      part: 'snippet',
      id: chunk.join(','),
      key: YOUTUBE_API_KEY,
    });

    const res = await fetch(`${YT}/channels?${params.toString()}`);

    if (!res.ok) {
      console.error(
        '[fetch-shorts] channel country fetch failed:',
        await res.text()
      );
      continue;
    }

    const data = await res.json();

    for (const item of data.items ?? []) {
      result[item.id] = item.snippet?.country ?? '';
    }
  }

  return result;
}

async function verifyShorts(videoIds: string[]): Promise<Set<string>> {
  const verified = new Set<string>();
  const BATCH = 20;

  for (let i = 0; i < videoIds.length; i += BATCH) {
    const chunk = videoIds.slice(i, i + BATCH);

    const results = await Promise.allSettled(
      chunk.map(async (id) => {
        const res = await fetch(`https://www.youtube.com/shorts/${id}`, {
          method: 'HEAD',
          redirect: 'follow',
        });

        return { id, isShort: res.url.includes('/shorts/') };
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.isShort) {
        verified.add(r.value.id);
      }
    }
  }

  return verified;
}

async function getDurations(
  videoIds: string[]
): Promise<Record<string, number>> {
  if (!videoIds.length) return {};

  const result: Record<string, number> = {};

  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);

    const params = new URLSearchParams({
      part: 'contentDetails',
      id: chunk.join(','),
      key: YOUTUBE_API_KEY,
    });

    const res = await fetch(`${YT}/videos?${params.toString()}`);

    if (!res.ok) {
      console.error('[fetch-shorts] duration fetch failed:', await res.text());
      continue;
    }

    const data = await res.json();

    for (const item of data.items ?? []) {
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

  for (const { name, q, videoCategoryId } of CATEGORIES) {
    try {
      const candidates = await searchCategory(name, q, videoCategoryId);

      if (!candidates.length) continue;

      const channelCountries = await getChannelCountries(
        candidates.map((c: any) => c.channelId)
      );

      const usCandidates = candidates.filter((c: any) => {
        return channelCountries[c.channelId] === 'US';
      });

      if (!usCandidates.length) {
        console.log(
          `[fetch-shorts] ${name}: ${candidates.length} candidates → 0 US-channel candidates`
        );
        continue;
      }

      const ids = usCandidates.map((c: any) => c.videoId);
      const durations = await getDurations(ids);

      const durationFiltered = usCandidates
        .map((c: any) => ({
          ...c,
          duration: durations[c.videoId] ?? 999,
        }))
        .filter(
          (c: any) => c.duration > 0 && c.duration <= MAX_SHORT_DURATION
        );

      const confirmedShortIds = await verifyShorts(
        durationFiltered.map((c: any) => c.videoId)
      );

      const rows = durationFiltered
        .filter((c: any) => confirmedShortIds.has(c.videoId))
        .map((c: any) => ({
          video_id: c.videoId,
          title: c.title,
          thumbnail: c.thumbnail,
          channel: c.channel,
          channel_id: c.channelId,
          channel_country: channelCountries[c.channelId] ?? null,
          duration: c.duration,
          category: c.category,
          published_at: c.publishedAt,
          fetched_at: new Date().toISOString(),
        }));

      if (rows.length) {
        const { error } = await db
          .from('shorts')
          .upsert(rows, { onConflict: 'video_id' });

        if (error) {
          console.error(`[fetch-shorts] upsert error (${name}):`, error);
        } else {
          totalUpserted += rows.length;
        }
      }

      console.log(
        `[fetch-shorts] ${name}: ${candidates.length} candidates → ${usCandidates.length} US-channel candidates → ${durationFiltered.length} ≤${MAX_SHORT_DURATION}s → ${confirmedShortIds.size} verified Shorts → ${rows.length} inserted`
      );
    } catch (e) {
      console.error(`[fetch-shorts] error for category ${name}:`, e);
    }
  }

  const cutoff = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  await db.from('shorts').delete().lt('fetched_at', cutoff);

  return new Response(JSON.stringify({ ok: true, upserted: totalUpserted }), {
    headers: { 'content-type': 'application/json' },
  });
});