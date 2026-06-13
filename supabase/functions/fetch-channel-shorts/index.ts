import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Curated-channel shorts ingester. Pulls each ranked channel's newest uploads via its
// uploads playlist (playlistItems = 1 quota unit), filters to real Shorts, and upserts
// into `shorts`. ~100x cheaper than the search-based fetch-shorts, so it can run often.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY')!;
const INTERNAL_SECRET = Deno.env.get('INTERNAL_SECRET')!;

const YT = 'https://www.googleapis.com/youtube/v3';

const MAX_SHORT_DURATION = 180;   // seconds
const PER_CHANNEL = 8;            // newest uploads to consider per channel
const MAX_CHANNELS = 120;         // channels per run (round-robined by last_fetched_at)
const FRESH_DAYS = 45;            // ignore uploads older than this so the feed stays current
const CHANNEL_CONCURRENCY = 15;

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return parseInt(m[1] ?? '0') * 3600 + parseInt(m[2] ?? '0') * 60 + parseInt(m[3] ?? '0');
}

function looksEnglish(text: string) {
  return /^[\x00-\x7F\s.,!?'"()\-:&%#@]+$/.test(text);
}

// The uploads playlist of any channel is its id with the 'UC' prefix swapped to 'UU'.
// Lets us skip channels.list entirely (saves a quota unit + a round-trip).
function uploadsPlaylist(channelId: string): string | null {
  return channelId.startsWith('UC') ? 'UU' + channelId.slice(2) : null;
}

type Candidate = {
  videoId: string; title: string; thumbnail: string;
  channel: string; channelId: string; publishedAt: string | null; category: string;
};

async function fetchChannelUploads(c: { channel_id: string; channel_title: string; category: string }): Promise<Candidate[]> {
  const pl = uploadsPlaylist(c.channel_id);
  if (!pl) return [];
  const params = new URLSearchParams({
    part: 'snippet,contentDetails',
    playlistId: pl,
    maxResults: String(PER_CHANNEL),
    key: YOUTUBE_API_KEY,
  });
  const res = await fetch(`${YT}/playlistItems?${params.toString()}`);
  if (!res.ok) {
    // 404 = no/blocked uploads playlist; skip quietly.
    if (res.status !== 404) { console.error(`[fetch-channel-shorts] playlistItems ${c.channel_id}:`, await res.text()); }
    return [];
  }
  const data = await res.json();
  const freshCutoff = Date.now() - FRESH_DAYS * 24 * 60 * 60 * 1000;
  return (data.items ?? [])
    .map((it: any) => ({
      videoId: it.contentDetails?.videoId as string,
      title: (it.snippet?.title ?? '') as string,
      thumbnail: (it.snippet?.thumbnails?.high?.url ?? it.snippet?.thumbnails?.default?.url ?? '') as string,
      channel: (it.snippet?.channelTitle ?? c.channel_title ?? '') as string,
      channelId: c.channel_id,
      publishedAt: it.contentDetails?.videoPublishedAt ?? it.snippet?.publishedAt ?? null,
      category: c.category,
    }))
    .filter((v: Candidate) => v.videoId && looksEnglish(v.title))
    .filter((v: Candidate) => !v.publishedAt || new Date(v.publishedAt).getTime() >= freshCutoff);
}

async function getDurations(videoIds: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({ part: 'contentDetails', id: chunk.join(','), key: YOUTUBE_API_KEY });
    const res = await fetch(`${YT}/videos?${params.toString()}`);
    if (!res.ok) { console.error('[fetch-channel-shorts] durations:', await res.text()); continue; }
    const data = await res.json();
    for (const item of data.items ?? []) {
      result[item.id] = parseDuration(item.contentDetails?.duration ?? '');
    }
  }
  return result;
}

// A channel's uploads include long videos; confirm each candidate is actually a Short
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

  const { data: channels, error: chErr } = await db.rpc('pick_channels_to_ingest', { p_limit: MAX_CHANNELS });
  if (chErr) {
    console.error('[fetch-channel-shorts] pick_channels_to_ingest:', chErr);
    return new Response(JSON.stringify({ error: chErr.message }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
  const picked = (channels ?? []) as { channel_id: string; channel_title: string; category: string }[];

  // Pull uploads for all picked channels (bounded concurrency).
  const candidates: Candidate[] = [];
  for (let i = 0; i < picked.length; i += CHANNEL_CONCURRENCY) {
    const batch = picked.slice(i, i + CHANNEL_CONCURRENCY);
    const lists = await Promise.all(batch.map(fetchChannelUploads));
    for (const l of lists) { candidates.push(...l); }
  }

  // Dedupe by video id (a video can't appear under two channels, but guard anyway).
  const byId = new Map<string, Candidate>();
  for (const c of candidates) { if (!byId.has(c.videoId)) { byId.set(c.videoId, c); } }
  const unique = [...byId.values()];

  let upserted = 0;
  if (unique.length) {
    const ids = unique.map((c) => c.videoId);
    const durations = await getDurations(ids);
    const durationOk = unique.filter((c) => {
      const d = durations[c.videoId] ?? 999;
      return d > 0 && d <= MAX_SHORT_DURATION;
    });
    const confirmed = await verifyShorts(durationOk.map((c) => c.videoId));
    const rows = durationOk
      .filter((c) => confirmed.has(c.videoId))
      .map((c) => ({
        video_id: c.videoId,
        title: c.title,
        thumbnail: c.thumbnail,
        channel: c.channel,
        channel_id: c.channelId,
        channel_country: null,
        duration: durations[c.videoId],
        category: c.category,
        published_at: c.publishedAt,
        fetched_at: new Date().toISOString(),
      }));
    if (rows.length) {
      const { error } = await db.from('shorts').upsert(rows, { onConflict: 'video_id' });
      if (error) { console.error('[fetch-channel-shorts] upsert:', error); }
      else { upserted = rows.length; }
    }
    console.log(`[fetch-channel-shorts] ${picked.length} channels → ${unique.length} uploads → ${durationOk.length} ≤${MAX_SHORT_DURATION}s → ${confirmed.size} verified → ${rows.length} inserted`);
  }

  // Mark processed channels as fetched so the next run rotates to the rest.
  if (picked.length) {
    await db.from('shorts_channels')
      .update({ last_fetched_at: new Date().toISOString() })
      .in('channel_id', picked.map((c) => c.channel_id));
  }

  return new Response(JSON.stringify({ ok: true, channels: picked.length, upserted }), {
    headers: { 'content-type': 'application/json' },
  });
});
