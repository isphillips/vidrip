import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = (Deno.env.get("GOOGLE_CLIENT_ID") ?? "").trim();
const GOOGLE_CLIENT_SECRET = (Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "").trim();

const YT = "https://www.googleapis.com/youtube/v3";
const COOLDOWN_MS = 15 * 60 * 1000;   // 1 refresh / 15 min, server-enforced
const MAX_DURATION = 180;             // short-form cap (seconds)
const MAX_CHANNELS = 10;              // top relevance-ranked subscriptions
const PER_CHANNEL = 15;               // recent uploads pulled per channel (pre-filter)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type RecVideo = {
  videoId: string; title: string; thumbnail: string | null;
  channelTitle: string; channelId: string; duration: number; publishedAt: string | null;
};

// ISO-8601 duration (PT#H#M#S) → seconds.
function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) { return 0; }
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}

async function googleRefresh(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  if (!res.ok) { throw new Error(`google refresh: ${await res.text()}`); }
  return res.json();
}

async function ytGet(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`${YT}/${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) { throw new Error(`youtube ${path.split("?")[0]}: ${await res.text()}`); }
  return res.json();
}

// subscriptions (relevance) → uploads playlists → recent uploads → filter to <=180s.
// All "regular query" endpoints (1 unit each) — no search.list (100 units).
async function buildRecommended(accessToken: string): Promise<RecVideo[]> {
  // 1. Most-relevant subscribed channels.
  const subs = await ytGet("subscriptions?part=snippet&mine=true&order=relevance&maxResults=50", accessToken);
  const channelIds: string[] = (subs.items ?? [])
    .map((it: any) => it.snippet?.resourceId?.channelId)
    .filter(Boolean)
    .slice(0, MAX_CHANNELS);
  if (!channelIds.length) { return []; }

  // 2. Each channel's uploads playlist + title.
  const chans = await ytGet(`channels?part=contentDetails,snippet&id=${channelIds.join(",")}`, accessToken);
  const uploads = (chans.items ?? [])
    .map((c: any) => ({ title: c.snippet?.title ?? "", playlist: c.contentDetails?.relatedPlaylists?.uploads }))
    .filter((u: any) => u.playlist);

  // 3. Recent uploads per channel.
  const candidates: RecVideo[] = [];
  for (const u of uploads) {
    const pl = await ytGet(
      `playlistItems?part=snippet&maxResults=${PER_CHANNEL}&playlistId=${u.playlist}`, accessToken,
    ).catch(() => null);
    for (const it of (pl?.items ?? [])) {
      const vid = it.snippet?.resourceId?.videoId;
      if (!vid) { continue; }
      candidates.push({
        videoId: vid,
        title: it.snippet?.title ?? "",
        thumbnail: it.snippet?.thumbnails?.high?.url ?? it.snippet?.thumbnails?.default?.url ?? null,
        channelTitle: u.title,
        channelId: it.snippet?.videoOwnerChannelId ?? it.snippet?.channelId ?? "",
        duration: 0,
        publishedAt: it.snippet?.publishedAt ?? null,
      });
    }
  }
  if (!candidates.length) { return []; }

  // 4. Durations (batched) → keep only short-form, dedup.
  const durById = new Map<string, number>();
  const ids = [...new Set(candidates.map(c => c.videoId))];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const vres = await ytGet(`videos?part=contentDetails&id=${chunk.join(",")}`, accessToken).catch(() => null);
    for (const v of (vres?.items ?? [])) {
      durById.set(v.id, parseDuration(v.contentDetails?.duration ?? ""));
    }
  }

  const seen = new Set<string>();
  const out: RecVideo[] = [];
  for (const c of candidates) {
    if (seen.has(c.videoId)) { continue; }
    const d = durById.get(c.videoId) ?? 0;
    if (d <= 0 || d > MAX_DURATION) { continue; }
    seen.add(c.videoId);
    out.push({ ...c, duration: d });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let userId = "";
    try {
      const p = JSON.parse(atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
      if (p.role === "authenticated" && typeof p.sub === "string") { userId = p.sub; }
    } catch { /* malformed */ }
    if (!userId) { return json({ error: "unauthorized" }, 401); }

    // The user's YouTube FEED connection holds the token we read recommendations with.
    const { data: acct } = await admin
      .from("synced_accounts")
      .select("id")
      .eq("user_id", userId).eq("provider", "youtube").eq("connection_type", "feed")
      .maybeSingle();
    if (!acct) { return json({ error: "Connect a YouTube account first." }, 400); }

    // Rate limit off the cache's own clock (decoupled from the For You refresh).
    const { data: latest } = await admin
      .from("recommended_items").select("fetched_at")
      .eq("user_id", userId).order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    const last = latest?.fetched_at ? new Date(latest.fetched_at).getTime() : 0;
    const remaining = COOLDOWN_MS - (Date.now() - last);
    if (remaining > 0) {
      const mins = Math.ceil(remaining / 60000);
      return json({ error: `You can refresh again in ${mins} minute${mins !== 1 ? "s" : ""}.`, retryAfterSec: Math.ceil(remaining / 1000) }, 429);
    }

    // Tokens — refresh the access token if expired.
    const { data: tok } = await admin
      .from("synced_account_tokens")
      .select("access_token, refresh_token, token_expires_at")
      .eq("synced_account_id", acct.id).single();
    if (!tok) { return json({ error: "Connection is missing credentials. Reconnect the account." }, 400); }

    let accessToken = tok.access_token;
    const expired = !tok.token_expires_at || new Date(tok.token_expires_at).getTime() < Date.now() + 60_000;
    if (expired) {
      if (!tok.refresh_token) { return json({ error: "Session expired. Reconnect the account." }, 400); }
      const refreshed = await googleRefresh(tok.refresh_token);
      accessToken = refreshed.access_token;
      await admin.from("synced_account_tokens").update({
        access_token: accessToken,
        token_expires_at: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("synced_account_id", acct.id);
    }

    const videos = await buildRecommended(accessToken);
    await admin.from("recommended_items").delete().eq("user_id", userId);
    if (videos.length) {
      const now = new Date().toISOString();
      await admin.from("recommended_items").insert(videos.map(v => ({
        user_id: userId, video_id: v.videoId, title: v.title, thumbnail: v.thumbnail,
        channel_title: v.channelTitle, channel_id: v.channelId, source_type: "youtube",
        duration: v.duration, published_at: v.publishedAt, fetched_at: now,
      })));
    }

    return json({ ok: true, imported: videos.length });
  } catch (e: any) {
    console.error("[fetch-recommended]", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
