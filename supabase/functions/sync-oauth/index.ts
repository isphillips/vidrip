import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Secrets (set via: supabase secrets set ...). SUPABASE_* are auto-injected.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// .trim() guards against stray whitespace pasted into the secret store — a
// leading space in TIKTOK_CLIENT_KEY caused invalid_client ("Client key does not
// match authorization record") on token exchange.
const GOOGLE_CLIENT_ID = (Deno.env.get("GOOGLE_CLIENT_ID") ?? "").trim();
const GOOGLE_CLIENT_SECRET = (Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "").trim();
const TIKTOK_CLIENT_KEY = (Deno.env.get("TIKTOK_CLIENT_KEY") ?? "").trim();
const TIKTOK_CLIENT_SECRET = (Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "").trim();
const INSTAGRAM_APP_ID = (Deno.env.get("INSTAGRAM_APP_ID") ?? "").trim();
const INSTAGRAM_APP_SECRET = (Deno.env.get("INSTAGRAM_APP_SECRET") ?? "").trim();

// Must exactly match the redirect_uri used in the authorize request
// (src/infrastructure/oauth/config.ts) and registered in each provider console.
const REDIRECT_URI = "https://ltpscwticavqutbzrrjb.supabase.co/functions/v1/oauth-callback";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

type Profile = { accountId: string; handle: string; displayName: string; avatar: string | null };
// mediaUrl is the direct video file (Instagram only) — re-hosted to storage at
// import since YouTube/TikTok play by id while Instagram has no embed player.
type Video = { id: string; title: string; thumbnail: string | null; mediaUrl?: string | null };

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

// ── Instagram (Instagram API with Instagram Login — no Facebook Page) ────────
const IG_GRAPH = "https://graph.instagram.com";

async function instagramExchange(code: string) {
  // 1. Code → short-lived token (~1 hour). Instagram Login has its OWN token
  //    endpoint with a form-encoded body (not the Facebook Graph endpoint).
  const shortRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: INSTAGRAM_APP_ID,
      client_secret: INSTAGRAM_APP_SECRET,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      // Instagram appends a stray "#_" fragment to the returned code.
      code: code.replace(/#_$/, ""),
    }),
  });
  if (!shortRes.ok) { throw new Error(`instagram token: ${await shortRes.text()}`); }
  const short = await shortRes.json(); // { access_token, user_id, permissions }
  // 2. Short-lived → long-lived (~60-day) token.
  const longRes = await fetch(
    `${IG_GRAPH}/access_token?grant_type=ig_exchange_token` +
    `&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${short.access_token}`);
  const long = longRes.ok ? await longRes.json() : null;
  return {
    access_token: long?.access_token ?? short.access_token,
    refresh_token: null,
    expires_in: long?.expires_in ?? null,
    scope: short.permissions ?? null,
  };
}

async function instagramProfileAndVideos(accessToken: string): Promise<{ profile: Profile; videos: Video[] }> {
  // Instagram Login reads the creator's OWN account directly — no Facebook Page hop.
  const pRes = await fetch(
    `${IG_GRAPH}/me?fields=user_id,username,account_type,profile_picture_url` +
    `&access_token=${accessToken}`);
  const pJson = await pRes.json();
  if (pJson.error || !pJson.username) {
    throw new Error(`IG profile: ${pJson.error?.message ?? "no username returned"}`);
  }
  const profile: Profile = {
    accountId: String(pJson.user_id ?? pJson.id ?? ""),
    handle: pJson.username ?? "",
    displayName: pJson.username ?? "",
    avatar: pJson.profile_picture_url ?? null,
  };
  const mRes = await fetch(
    `${IG_GRAPH}/me/media?fields=id,media_type,media_product_type,` +
    `media_url,thumbnail_url,caption,permalink&limit=25&access_token=${accessToken}`);
  const mJson = await mRes.json();
  const items = mJson.data ?? [];
  const videos: Video[] = items
    .filter((m: any) => m.media_type === "VIDEO")   // Reels report media_type VIDEO
    .slice(0, 12)
    .map((m: any) => ({
      id: String(m.id),
      title: (m.caption ?? "").slice(0, 120),
      thumbnail: m.thumbnail_url ?? null,
      mediaUrl: m.media_url ?? null,
    }))
    .filter((v: Video) => v.id && v.mediaUrl);
  // TEMP diagnostic: surface what the Graph API returned when nothing imports.
  if (videos.length === 0) {
    const summary = items.map((m: any) =>
      `${m.media_type}/${m.media_product_type}${m.media_url ? "+url" : "-url"}`).join(", ");
    const apiErr = mJson.error ? ` graph-error: ${mJson.error.message}` : "";
    throw new Error(`IG: no importable videos. ${items.length} media: [${summary}]${apiErr}`);
  }
  return { profile, videos };
}

// Download a (signed, expiring) Instagram media URL and re-host it to our storage
// so it stays playable. Returns the stable public URL, or null on failure.
async function rehostInstagramVideo(
  admin: any, channelId: string, mediaId: string, mediaUrl: string,
): Promise<string | null> {
  try {
    const dl = await fetch(mediaUrl);
    if (!dl.ok) { return null; }
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const path = `instagram/${channelId}/${mediaId}.mp4`;
    const { error } = await admin.storage.from("channel-clips")
      .upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (error) { console.error("[sync-oauth] ig upload", error); return null; }
    return admin.storage.from("channel-clips").getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("[sync-oauth] ig rehost failed", mediaId, e);
    return null;
  }
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

    const { provider, code, connectionType } = await req.json();
    if (provider !== "youtube" && provider !== "tiktok" && provider !== "instagram") {
      return new Response("bad provider", { status: 400, headers: cors });
    }
    const connType = connectionType === "feed" ? "feed" : "creator";

    // 1. Exchange code → tokens, fetch profile + recent videos.
    const tokens = provider === "youtube" ? await youtubeExchange(code)
      : provider === "tiktok" ? await tiktokExchange(code)
      : await instagramExchange(code);
    const accessToken = tokens.access_token;
    const { profile, videos } = provider === "youtube"
      ? await youtubeProfileAndVideos(accessToken)
      : provider === "tiktok" ? await tiktokProfileAndVideos(accessToken)
      : await instagramProfileAndVideos(accessToken);

    // 2. Upsert the synced account (display data). A 'feed' connection leaves
    //    last_synced_at null so the first refresh-feed call is allowed immediately.
    const { data: acct, error: acctErr } = await admin
      .from("synced_accounts")
      .upsert({
        user_id: userId, provider, connection_type: connType,
        provider_account_id: profile.accountId,
        provider_handle: profile.handle,
        provider_display_name: profile.displayName,
        provider_avatar_url: profile.avatar,
        enabled: true,
        last_synced_at: connType === "creator" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider,connection_type" })
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

    // A 'feed' connection has no Members Only channel and imports no posts — the
    // For You grid is populated by the refresh-feed function. Done here.
    if (connType === "feed") {
      return new Response(JSON.stringify({
        ok: true, provider, connectionType: connType, handle: profile.handle,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // 4. Ensure the creator's Members Only channel (unhide if it exists).
    let { data: channel } = await admin
      .from("groups")
      .select("id")
      .eq("created_by", userId)
      .eq("is_members_only", true)
      .maybeSingle();
    if (!channel) {
      // The private room is branded with the creator's Vidrip display name.
      const { data: vUser } = await admin
        .from("users").select("display_name, handle").eq("id", userId).maybeSingle();
      const roomName = vUser?.display_name || vUser?.handle || profile.handle || "Creator";
      const { data: created, error: chErr } = await admin
        .from("groups")
        .insert({
          name: roomName,
          created_by: userId,
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
      const fresh = videos.filter(v => !have.has(v.id));
      const rows: any[] = [];
      let rehostFail = 0;
      for (const v of fresh) {
        // Instagram source posts play from a re-hosted file (no embed player).
        // Skip a Reel we couldn't host — it would be unplayable otherwise.
        let videoUrl: string | null = null;
        if (provider === "instagram") {
          if (!v.mediaUrl) { rehostFail++; continue; }
          videoUrl = await rehostInstagramVideo(admin, channel!.id, v.id, v.mediaUrl);
          if (!videoUrl) { rehostFail++; continue; }
        }
        rows.push({
          channel_id: channel!.id, poster_id: userId,
          post_type: "youtube", source_type: provider,
          yt_video_id: v.id, yt_video_title: v.title, yt_video_thumbnail: v.thumbnail,
          video_url: videoUrl,
          is_pinned: false,
        });
      }
      if (rows.length) { await admin.from("channel_posts").insert(rows); }
      // TEMP diagnostic: all fresh Reels failed to re-host to storage.
      if (provider === "instagram" && fresh.length > 0 && rows.length === 0) {
        throw new Error(`IG: re-host failed for all ${fresh.length} Reels (check channel-clips bucket).`);
      }
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
