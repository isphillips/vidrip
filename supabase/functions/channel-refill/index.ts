import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// channel-refill: keeps an auto-channel stocked. Two strategies:
//   • "rank"     — pick the top source videos from our OWN engagement (source_video_stats RPC), ranked
//                  by reaction count / measured smile / surprise / emoji density. Use once data accrues.
//   • "discover" — pull fresh embeddable videos from YouTube. Two sources, mix freely:
//                    - youtubeChannelIds: curated channels via RSS  (NO key, no quota, datacenter-safe)
//                    - youtubeQuery:      Data API search by topic   (needs YOUTUBE_API_KEY)
//                  (Reddit's public .json 403s datacenters and image subs carry no embeddable video, so
//                   it's not used; Reddit-via-OAuth could be added later if ever needed.)
// Either way it dedupes against what's already in the channel and DRIP-inserts with staggered
// release_dates (the grid query hides a post until release_date passes — so the channel self-publishes).
//
// SCHEDULE: one cron per channel (Supabase Scheduled Functions / pg_cron → net.http_post), e.g.
//   { "channelId":"...", "houseAccountId":"...", "strategy":"discover",
//     "youtubeChannelIds":["UCxxxx","UCyyyy"], "limit":6, "dripHours":3 }
//   { "channelId":"...", "houseAccountId":"...", "strategy":"discover",
//     "youtubeQuery":"cute puppies", "limit":6 }                       // needs YOUTUBE_API_KEY
//   { "channelId":"...", "houseAccountId":"...", "strategy":"rank",
//     "metric":"smile", "windowHours":336, "minReactions":5, "limit":6 }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const YOUTUBE_API_KEY = (Deno.env.get("YOUTUBE_API_KEY") ?? "").trim();
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Source = "youtube" | "tiktok" | "instagram" | "facebook";
type Pick = { source_type: Source; video_id: string; title: string | null; thumbnail: string | null };

type Payload = {
  channelId: string;
  houseAccountId: string;
  strategy: "rank" | "discover";
  // rank:
  metric?: "reactions" | "smile" | "surprise" | "emoji";
  windowHours?: number;
  minReactions?: number;
  // discover:
  youtubeChannelIds?: string[];     // RSS (no key) — curated channels' latest uploads
  youtubeQuery?: string | string[]; // Data API search by topic (needs YOUTUBE_API_KEY); array = variety
  searchDays?: number;              // only consider uploads from the last N days (default 14) — keeps it FRESH
  // The reaction recorder is VERTICAL, so default to vertical Shorts only. Verified by duration via the
  // Data API (Shorts are <= maxShortSeconds), so this needs YOUTUBE_API_KEY even for RSS-found videos.
  shortsOnly?: boolean;             // default true
  maxShortSeconds?: number;         // default 60
  // shared:
  limit?: number;
  dripHours?: number;
};

// Embeds can't be frame-moderated, so auto-discovery leans on safe sources + a crude title denylist.
// (rank-strategy picks are already in-app reacted content, which passed client-side moderation.)
const DENY = /\b(nsfw|onlyfans|sex|porn|nude|nudity|gore|graphic|death|shooting)\b/i;
const looksSafe = (t: string | null | undefined) => !t || !DENY.test(t);

// Minimal XML entity decode for RSS titles.
function decodeXml(s: string | null): string | null {
  return s == null ? null : s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

// Source videos already posted in this channel → "source_type:video_id" keys (the dedupe set).
async function existingKeys(channelId: string): Promise<Set<string>> {
  const { data } = await admin.from("channel_posts")
    .select("source_type, yt_video_id")
    .eq("channel_id", channelId)
    .is("parent_post_id", null);
  return new Set((data ?? []).map((r: any) => `${r.source_type}:${r.yt_video_id}`));
}

// ── Strategy: rank by our own measured engagement ──────────────────────────────────────────────────
async function rankPicks(p: Payload): Promise<Pick[]> {
  const since = new Date(Date.now() - (p.windowHours ?? 48) * 3_600_000).toISOString();
  const { data, error } = await admin.rpc("source_video_stats", { p_since: since });
  if (error) { throw error; }
  const col = p.metric === "smile" ? "avg_smile"
    : p.metric === "surprise" ? "avg_surprise"
    : p.metric === "emoji" ? "avg_emoji_density"
    : "reactions";
  const minR = p.minReactions ?? 3;
  return (data ?? [])
    .filter((r: any) => r.reactions >= minR && r[col] != null && looksSafe(r.title))
    .sort((a: any, b: any) => (b[col] ?? 0) - (a[col] ?? 0))
    .map((r: any) => ({ source_type: r.source_type as Source, video_id: r.video_id, title: r.title, thumbnail: r.thumbnail }));
}

// ── Strategy: discover from YouTube ─────────────────────────────────────────────────────────────────

// Curated channels' latest uploads via the public RSS feed. No key, no quota, datacenter-safe.
function parseYtRss(xml: string): Pick[] {
  const out: Pick[] = [];
  // Each <entry> = one upload. slice(1) drops the channel-header chunk (which also has a <title>).
  for (const entry of xml.split("<entry>").slice(1)) {
    const id = entry.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
    if (!id) { continue; }
    const title = decodeXml(entry.match(/<title>([^<]*)<\/title>/)?.[1] ?? null);
    out.push({ source_type: "youtube", video_id: id, title, thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg` });
  }
  return out;
}

async function discoverYouTubeRss(channelIds: string[]): Promise<Pick[]> {
  const out: Pick[] = [];
  for (const cid of channelIds) {
    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(cid)}`);
      if (!res.ok) { continue; }
      for (const p of parseYtRss(await res.text())) { if (looksSafe(p.title)) { out.push(p); } }
    } catch { /* skip a flaky channel */ }
  }
  return out;
}

// Parse an ISO-8601 duration (PT#H#M#S) to seconds.
function iso8601ToSec(d: string): number {
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0;
}

// Keep only vertical short-form by DURATION (Shorts are <= maxSeconds). There's no aspect-ratio flag in
// the Data API, so duration is the reliable proxy; it works on any video id (RSS- or search-found).
// Needs the key — without it we can't verify, and we won't post landscape into a vertical recorder.
async function keepShorts(picks: Pick[], maxSeconds: number): Promise<Pick[]> {
  if (!picks.length || !YOUTUBE_API_KEY) { return []; }
  const byId = new Map(picks.map((p) => [p.video_id, p]));
  const ids = [...byId.keys()];
  const out: Pick[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const u = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails`
      + `&id=${ids.slice(i, i + 50).join(",")}&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(u);
    if (!res.ok) { continue; }
    const j = await res.json();
    for (const it of j.items ?? []) {
      const sec = iso8601ToSec(it?.contentDetails?.duration ?? "");
      const p = byId.get(it.id);
      if (p && sec > 0 && sec <= maxSeconds) { out.push(p); }
    }
  }
  return out;
}

// Topic search via the Data API (embeddable + strict safe-search). Needs YOUTUBE_API_KEY; ~100 units/call.
// `order=viewCount` + `publishedAfter` = "the most-watched uploads of the last N days for this topic" —
// fresh AND popular, so a daily refill keeps surfacing new stuff instead of the same all-time hits.
// `shortsOnly` narrows to <4min at the search step (a duration recheck in keepShorts enforces the real cap).
async function discoverYouTubeSearch(query: string, sinceDays = 14, shortsOnly = true, max = 25): Promise<Pick[]> {
  if (!YOUTUBE_API_KEY) { return []; }
  const publishedAfter = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const u = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video`
    + `&videoEmbeddable=true&safeSearch=strict&order=viewCount&maxResults=${max}`
    + (shortsOnly ? "&videoDuration=short" : "")
    + `&publishedAfter=${publishedAfter}&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`;
  const res = await fetch(u);
  if (!res.ok) { return []; }
  const j = await res.json();
  return (j.items ?? [])
    .map((it: any): Pick => ({
      source_type: "youtube",
      video_id: it?.id?.videoId,
      title: it?.snippet?.title ?? null,
      thumbnail: it?.snippet?.thumbnails?.high?.url ?? `https://img.youtube.com/vi/${it?.id?.videoId}/hqdefault.jpg`,
    }))
    .filter((p: Pick) => p.video_id && looksSafe(p.title));
}

async function discover(p: Payload): Promise<Pick[]> {
  const shortsOnly = p.shortsOnly !== false;   // default true — the recorder is vertical
  let out: Pick[] = [];
  if (p.youtubeChannelIds?.length) { out = out.concat(await discoverYouTubeRss(p.youtubeChannelIds)); }
  const queries = Array.isArray(p.youtubeQuery) ? p.youtubeQuery : p.youtubeQuery ? [p.youtubeQuery] : [];
  for (const q of queries) { out = out.concat(await discoverYouTubeSearch(q, p.searchDays ?? 14, shortsOnly)); }
  // Enforce vertical: drop anything longer than a Short (RSS feeds + search both pass through here).
  if (shortsOnly) { out = await keepShorts(out, p.maxShortSeconds ?? 60); }
  return out;
}
// TODO discoverTMDB(): /movie/upcoming → /movie/{id}/videos (YouTube trailers) for the First Reactions channel.

// ── Drip-insert (dedupe → staggered release_date) ───────────────────────────────────────────────────
async function dripInsert(p: Payload, picks: Pick[]): Promise<number> {
  const seen = await existingKeys(p.channelId);
  const fresh: Pick[] = [];
  const local = new Set<string>();
  for (const v of picks) {
    const k = `${v.source_type}:${v.video_id}`;
    if (!v.video_id || seen.has(k) || local.has(k)) { continue; }
    local.add(k);
    fresh.push(v);
    if (fresh.length >= (p.limit ?? 6)) { break; }
  }
  if (!fresh.length) { return 0; }

  const dripMs = (p.dripHours ?? 3) * 3_600_000;
  const now = Date.now();
  const rows = fresh.map((v, i) => ({
    channel_id: p.channelId,
    poster_id: p.houseAccountId,
    post_type: "youtube",            // the "source video" post type (source_type is the platform)
    source_type: v.source_type,
    yt_video_id: v.video_id,
    yt_video_title: v.title,
    yt_video_thumbnail: v.thumbnail,
    is_pinned: false,
    hidden: false,
    release_date: new Date(now + i * dripMs).toISOString(),   // staggered → self-publishing drip
  }));

  // channel_posts_dedupe (unique partial index) is the hard backstop against races; we pre-filter above.
  const { error } = await admin.from("channel_posts").insert(rows);
  if (error) { throw error; }
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  try {
    const p = await req.json() as Payload;
    if (!p.channelId || !p.houseAccountId) { return json({ error: "channelId + houseAccountId required" }, 400); }

    const picks = p.strategy === "discover"
      ? await discover(p)
      : await rankPicks(p);

    const inserted = await dripInsert(p, picks);
    return json({ ok: true, strategy: p.strategy, candidates: picks.length, inserted });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
