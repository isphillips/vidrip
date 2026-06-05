import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY_MP')!;
const INTERNAL_SECRET = Deno.env.get('INTERNAL_SECRET')!;

const YT = 'https://www.googleapis.com/youtube/v3';

const CATEGORIES = [
  { name: 'latest', q: '#Shorts' },
  { name: 'latest', q: '#viral #Shorts' },
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

async function searchCategory(category: string, q: string) {
  const publishedAfter = new Date(
    Date.now() - 6 * 60 * 60 * 1000
  ).toISOString();

  const params = new URLSearchParams({
    part: 'id,snippet',
    type: 'video',
    videoDuration: 'short',
    maxResults: '50',
    q,
    order: 'date',
    publishedAfter,
    key: YOUTUBE_API_KEY,
  });

  const res = await fetch(`${YT}/search?${params.toString()}`);

  if (!res.ok) {
    console.error(
      `[fetch-latest-shorts] search failed for ${category}:`,
      await res.text()
    );
    return [];
  }

  const data = await res.json();

  return (data.items ?? [])
    .filter((item: any) => item.id?.videoId)
    .map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title ?? '',
      thumbnail:
        item.snippet.thumbnails?.high?.url ??
        item.snippet.thumbnails?.default?.url ??
        '',
      channel: item.snippet.channelTitle ?? '',
      publishedAt: item.snippet.publishedAt ?? null,
      category,
    }));
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
      console.error('[fetch-latest-shorts] duration fetch failed:', await res.text());
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

  for (const { name, q } of CATEGORIES) {
    try {
      const candidates = await searchCategory(name, q);
      if (!candidates.length) continue;

      const ids = candidates.map((c: any) => c.videoId);
      const durations = await getDurations(ids);

      const durationFiltered = candidates
        .map((c: any) => ({
          ...c,
          duration: durations[c.videoId] ?? 999,
        }))
        .filter((c: any) => c.duration > 0 && c.duration <= 60);

      const confirmedShortIds = await verifyShorts(
        durationFiltered.map((c: any) => c.videoId),
      );

      const rows = durationFiltered
        .filter((c: any) => confirmedShortIds.has(c.videoId))
        .map((c: any) => ({
          video_id: c.videoId,
          title: c.title,
          thumbnail: c.thumbnail,
          channel: c.channel,
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
          console.error(`[fetch-latest-shorts] upsert error (${name}):`, error);
        } else {
          totalUpserted += rows.length;
        }
      }

      console.log(
        `[fetch-latest-shorts] ${name}: ${candidates.length} candidates → ${rows.length} latest shorts`,
      );
    } catch (e) {
      console.error(`[fetch-latest-shorts] error for category ${name}:`, e);
    }
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.from('shorts').delete().lt('fetched_at', cutoff);

  return new Response(JSON.stringify({ ok: true, upserted: totalUpserted }), {
    headers: { 'content-type': 'application/json' },
  });
});