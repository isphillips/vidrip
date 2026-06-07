import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Secrets (set via: supabase secrets set ...). SUPABASE_* are auto-injected.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const TIKTOK_CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY") ?? "";
const TIKTOK_CLIENT_SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "";

// Must exactly match the redirect_uri used in the authorize request
// (src/infrastructure/oauth/config.ts) and registered in each provider console.
const REDIRECT_URI = "https://ltpscwticavqutbzrrjb.supabase.co/functions/v1/oauth-callback";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

type Profile = { accountId: string; handle: string; displayName: string; avatar: string | null };
type Video = { id: string; title: string; thumbnail: string | null };

// ── YouTube ───────────────────────────────────────────────────────────────────
async function youtubeExchange(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI, grant_type: "authorization_code",
    }),
  });
  if (!res.ok) { throw new Error(`youtube token: ${await res.text()}`); }
  return res.json();
}

async function youtubeProfileAndVideos(accessToken: string): Promise<{ profile: Profile; videos: Video[] }> {
  const h = { Authorization: `Bearer ${accessToken}` };
  const chRes = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true", { headers: h });
  const ch = (await chRes.json()).items?.[0];
  if (!ch) { throw new Error("no youtube channel"); }
  const profile: Profile = {
    accountId: ch.id,
    handle: ch.snippet?.customUrl?.replace(/^@/, "") ?? ch.snippet?.title ?? "",
    displayName: ch.snippet?.title ?? "",
    avatar: ch.snippet?.thumbnails?.default?.url ?? null,
  };
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  let videos: Video[] = [];
  if (uploads) {
    const vRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=12&playlistId=${uploads}`,
      { headers: h });
    videos = ((await vRes.json()).items ?? []).map((it: any) => ({
      id: it.snippet?.resourceId?.videoId,
      title: it.snippet?.title ?? "",
      thumbnail: it.snippet?.thumbnails?.high?.url ?? null,
    })).filter((v: Video) => v.id);
  }
  return { profile, videos };
}

// ── TikTok ──────────────────────────────────────────────────────────────────
async function tiktokExchange(code: string) {
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET,
      code, grant_type: "authorization_code", redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) { throw new Error(`tiktok token: ${await res.text()}`); }
  return res.json();
}

async function tiktokProfileAndVideos(accessToken: string): Promise<{ profile: Profile; videos: Video[] }> {
  const h = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const uRes = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,username", { headers: h });
  const u = (await uRes.json()).data?.user ?? {};
  const profile: Profile = {
    accountId: u.open_id ?? "",
    handle: u.username ?? "",
    displayName: u.display_name ?? "",
    avatar: u.avatar_url ?? null,
  };
  const vRes = await fetch("https://open.tiktokapis.com/v2/video/list/?fields=id,title,cover_image_url", {
    method: "POST", headers: h, body: JSON.stringify({ max_count: 12 }),
  });
  const videos: Video[] = ((await vRes.json()).data?.videos ?? []).map((v: any) => ({
    id: String(v.id), title: v.title ?? "", thumbnail: v.cover_image_url ?? null,
  })).filter((v: Video) => v.id);
  return { profile, videos };
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Identify the calling user from their Supabase JWT. The platform
    // (verify_jwt=true) has ALREADY validated the token's signature + expiry
    // before invoking us, so we trust its claims. We deliberately do NOT call
    // auth.getUser(): that does a stateful session lookup that returns
    // "Auth session missing" when the session was rotated/revoked even though the
    // access token itself is still valid — which happens on devices after the
    // OAuth system-browser round-trip.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let userId = "";
    try {
      const payload = JSON.parse(
        atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.role === "authenticated" && typeof payload.sub === "string") {
        userId = payload.sub;
      }
    } catch { /* malformed token */ }
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { provider, code } = await req.json();
    if (provider !== "youtube" && provider !== "tiktok") {
      return new Response("bad provider", { status: 400, headers: cors });
    }

    // 1. Exchange code → tokens, fetch profile + recent videos.
    const tokens = provider === "youtube" ? await youtubeExchange(code) : await tiktokExchange(code);
    const accessToken = tokens.access_token;
    const { profile, videos } = provider === "youtube"
      ? await youtubeProfileAndVideos(accessToken)
      : await tiktokProfileAndVideos(accessToken);

    // 2. Upsert the synced account (display data).
    const { data: acct, error: acctErr } = await admin
      .from("synced_accounts")
      .upsert({
        user_id: userId, provider,
        provider_account_id: profile.accountId,
        provider_handle: profile.handle,
        provider_display_name: profile.displayName,
        provider_avatar_url: profile.avatar,
        enabled: true,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider" })
      .select("id")
      .single();
    if (acctErr) { throw acctErr; }

    // 3. Store tokens (service-role table).
    await admin.from("synced_account_tokens").upsert({
      synced_account_id: acct.id,
      access_token: accessToken,
      refresh_token: tokens.refresh_token ?? null,
      token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
      scopes: tokens.scope ?? null,
      updated_at: new Date().toISOString(),
    });

    // 4. Ensure the creator's Members Only channel (unhide if it exists).
    let { data: channel } = await admin
      .from("groups")
      .select("id")
      .eq("creator_id", userId)
      .eq("is_members_only", true)
      .maybeSingle();
    if (!channel) {
      const { data: created, error: chErr } = await admin
        .from("groups")
        .insert({
          name: `@${profile.handle || "creator"}`,
          created_by: userId,
          creator_id: userId,
          is_public: false,
          is_members_only: true,
          is_hidden: false,
          avatar_url: profile.avatar,
        })
        .select("id")
        .single();
      if (chErr || !created) { throw chErr ?? new Error("failed to create channel"); }
      channel = created;
      // Creator is a member/owner of their own channel.
      await admin.from("group_members").insert({ group_id: channel.id, user_id: userId, role: "owner" });
    } else {
      await admin.from("groups").update({ is_hidden: false, avatar_url: profile.avatar }).eq("id", channel.id);
    }

    // 5. Import recent videos as reactable posts (skip ones already imported).
    if (channel && videos.length) {
      const { data: existing } = await admin
        .from("channel_posts")
        .select("yt_video_id")
        .eq("channel_id", channel.id)
        .eq("post_type", "youtube");
      const have = new Set((existing ?? []).map((r: any) => r.yt_video_id));
      const rows = videos.filter(v => !have.has(v.id)).map(v => ({
        channel_id: channel!.id, poster_id: userId,
        post_type: "youtube", source_type: provider,
        yt_video_id: v.id, yt_video_title: v.title, yt_video_thumbnail: v.thumbnail,
        is_pinned: false,
      }));
      if (rows.length) { await admin.from("channel_posts").insert(rows); }
    }

    return new Response(JSON.stringify({
      ok: true, provider, handle: profile.handle, channelId: channel?.id, imported: videos.length,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[sync-oauth]", e);
    const error = e?.message ?? e?.error_description ?? e?.msg
      ?? (typeof e === "object" ? JSON.stringify(e) : String(e));
    return new Response(JSON.stringify({ error }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
