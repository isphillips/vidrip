import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = (Deno.env.get("GOOGLE_CLIENT_ID") ?? "").trim();
const GOOGLE_CLIENT_SECRET = (Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "").trim();

const COOLDOWN_MS = 5 * 60 * 1000; // 1 refresh / 5 min, server-enforced.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type FeedVideo = {
  videoId: string; title: string; thumbnail: string | null;
  channelTitle: string; publishedAt: string | null;
};

// Refresh an expired Google access token using the stored refresh token.
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
  return res.json(); // { access_token, expires_in, scope, token_type }
}

// The user's Liked Videos playlist (relatedPlaylists.likes), most-recent first.
async function youtubeLikedVideos(accessToken: string): Promise<FeedVideo[]> {
  const h = { Authorization: `Bearer ${accessToken}` };
  const chRes = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true", { headers: h });
  const likes = (await chRes.json()).items?.[0]?.contentDetails?.relatedPlaylists?.likes;
  if (!likes) { return []; }
  const vRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=30&playlistId=${likes}`,
    { headers: h });
  return ((await vRes.json()).items ?? []).map((it: any) => ({
    videoId: it.snippet?.resourceId?.videoId,
    title: it.snippet?.title ?? "",
    thumbnail: it.snippet?.thumbnails?.high?.url ?? it.snippet?.thumbnails?.default?.url ?? null,
    channelTitle: it.snippet?.videoOwnerChannelTitle ?? it.snippet?.channelTitle ?? "",
    publishedAt: it.snippet?.publishedAt ?? null, // when the video was liked
  })).filter((v: FeedVideo) => v.videoId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Trust the platform-verified JWT (verify_jwt=true) — see sync-oauth.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let userId = "";
    try {
      const p = JSON.parse(atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
      if (p.role === "authenticated" && typeof p.sub === "string") { userId = p.sub; }
    } catch { /* malformed */ }
    if (!userId) { return json({ error: "unauthorized" }, 401); }

    const { provider } = await req.json();
    if (provider !== "youtube") {
      return json({ error: "Feed refresh is only available for YouTube right now." }, 400);
    }

    // Find the user's FEED connection for this provider.
    const { data: acct } = await admin
      .from("synced_accounts")
      .select("id, last_synced_at")
      .eq("user_id", userId).eq("provider", provider).eq("connection_type", "feed")
      .maybeSingle();
    if (!acct) {
      return json({ error: "No connected feed. Connect a YouTube account first." }, 400);
    }

    // Rate limit: 1 refresh / 15 min.
    const last = acct.last_synced_at ? new Date(acct.last_synced_at).getTime() : 0;
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

    // Pull the feed and replace the cached items for this user+provider.
    const videos = await youtubeLikedVideos(accessToken);
    await admin.from("connected_feed_items").delete().eq("user_id", userId).eq("provider", provider);
    if (videos.length) {
      const now = new Date().toISOString();
      await admin.from("connected_feed_items").insert(videos.map(v => ({
        user_id: userId, provider, video_id: v.videoId,
        title: v.title, thumbnail: v.thumbnail, channel_title: v.channelTitle,
        source_type: provider, published_at: v.publishedAt, fetched_at: now,
      })));
    }

    // Stamp the refresh time (the rate-limit clock) even when 0 items came back.
    await admin.from("synced_accounts")
      .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", acct.id);

    return json({ ok: true, imported: videos.length });
  } catch (e: any) {
    console.error("[refresh-feed]", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
