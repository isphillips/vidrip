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
const FACEBOOK_APP_ID = (Deno.env.get("FACEBOOK_APP_ID") ?? "").trim();
const FACEBOOK_APP_SECRET = (Deno.env.get("FACEBOOK_APP_SECRET") ?? "").trim();

// Must exactly match the redirect_uri used in the authorize request
// (src/infrastructure/oauth/config.ts) and registered in each provider console.
// Served by the Cloudflare Pages Function at web/functions/api/oauth-callback.ts.
const REDIRECT_URI = "https://vidrip.app/api/oauth-callback";

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
  // `username` is intentionally NOT requested — it needs the user.info.profile scope, which
  // we dropped. display_name (from user.info.basic) covers the account label, so handle is "".
  const uRes = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name", { headers: h });
  const u = (await uRes.json()).data?.user ?? {};
  const profile: Profile = {
    accountId: u.open_id ?? "",
    handle: "",
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

// Instagram AND Facebook reels play from a re-hosted file (their media/source URLs
// are signed CDN links that expire, and neither has an embed player keyed by id).
const REHOST_PROVIDERS = new Set(["instagram", "facebook"]);

// Download a (signed, expiring) media URL and re-host it to our storage so it stays
// playable. `provider` namespaces the storage path. Returns the stable public URL,
// or null on failure.
async function rehostVideo(
  admin: any, provider: string, channelId: string, mediaId: string, mediaUrl: string,
): Promise<string | null> {
  try {
    const dl = await fetch(mediaUrl);
    if (!dl.ok) { return null; }
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const path = `${provider}/${channelId}/${mediaId}.mp4`;
    const { error } = await admin.storage.from("channel-clips")
      .upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (error) { console.error("[sync-oauth] video upload", error); return null; }
    return admin.storage.from("channel-clips").getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("[sync-oauth] video rehost failed", provider, mediaId, e);
    return null;
  }
}

// Thumbnail URLs (scontent.cdninstagram.com / fbcdn.net) are signed and expire, so the
// feed shows blank thumbnails once they 403. Re-host the image to storage at import
// for a stable URL. Returns the public URL, or null on failure.
async function rehostImage(
  admin: any, provider: string, channelId: string, mediaId: string, imageUrl: string,
): Promise<string | null> {
  try {
    const dl = await fetch(imageUrl);
    if (!dl.ok) { return null; }
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const path = `${provider}/${channelId}/${mediaId}.jpg`;
    const { error } = await admin.storage.from("channel-clips")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) { console.error("[sync-oauth] thumb upload", error); return null; }
    return admin.storage.from("channel-clips").getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("[sync-oauth] thumb rehost failed", provider, mediaId, e);
    return null;
  }
}

// Reel captions/descriptions carry newlines/extra whitespace and are often empty.
// Collapse to a clean single-line title; fall back to the creator handle when empty.
function cleanCaption(
  caption: string | null | undefined, handle: string, platform: string,
): string {
  const c = (caption ?? "").replace(/\s+/g, " ").trim();
  if (c) { return c.slice(0, 120); }
  return handle ? `@${handle} on ${platform}` : `${platform} Reel`;
}

// ── Facebook (Pages → Reels via the Graph API) ──────────────────────────────────
const FB_GRAPH = "https://graph.facebook.com/v21.0";

export type FacebookPage = { id: string; name: string; avatar: string | null };
// token is null for Pages the user can see (pages_show_list) but can't manage — those
// can't have their reels read, so the picker shows them as non-importable.
type FacebookPageWithToken = FacebookPage & { token: string | null };

async function facebookExchange(code: string) {
  // 1. code → short-lived user token.
  const shortRes = await fetch(`${FB_GRAPH}/oauth/access_token?` + new URLSearchParams({
    client_id: FACEBOOK_APP_ID, client_secret: FACEBOOK_APP_SECRET,
    redirect_uri: REDIRECT_URI, code,
  }).toString());
  if (!shortRes.ok) { throw new Error(`facebook token: ${await shortRes.text()}`); }
  const short = await shortRes.json(); // { access_token, token_type, expires_in }
  // 2. short → long-lived user token (~60 days). Page tokens derived from a long-lived
  //    user token don't expire, so this is what keeps imports working.
  const longRes = await fetch(`${FB_GRAPH}/oauth/access_token?` + new URLSearchParams({
    grant_type: "fb_exchange_token", client_id: FACEBOOK_APP_ID,
    client_secret: FACEBOOK_APP_SECRET, fb_exchange_token: short.access_token,
  }).toString());
  const long = longRes.ok ? await longRes.json() : null;
  return {
    access_token: long?.access_token ?? short.access_token,
    refresh_token: null,
    expires_in: long?.expires_in ?? short.expires_in ?? null,
    scope: null as string | null,
  };
}

// List the Pages this user has on their account, each with its (long-lived) Page
// access token when available. We keep the token server-side only; the client picker
// sees id/name/avatar + whether it's importable. Pages without a token (user can see
// but not manage them) are still returned so the picker can explain why they're greyed.
// Follows pagination so accounts with many Pages aren't truncated.
async function facebookListPages(userToken: string): Promise<FacebookPageWithToken[]> {
  const out: FacebookPageWithToken[] = [];
  let url =
    `${FB_GRAPH}/me/accounts?fields=id,name,picture{url},access_token&limit=100&access_token=${userToken}`;
  for (let page = 0; page < 10 && url; page++) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) { throw new Error(`facebook pages: ${json.error.message}`); }
    for (const p of (json.data ?? [])) {
      if (!p.id) { continue; }
      out.push({
        id: String(p.id), name: p.name ?? "",
        avatar: p.picture?.data?.url ?? null, token: p.access_token ?? null,
      });
    }
    url = json.paging?.next ?? "";
  }
  return out;
}

async function facebookPageReels(pageId: string, pageToken: string): Promise<Video[]> {
  // The Page's published reels. `source` is the (expiring) MP4; `picture` the thumb.
  const res = await fetch(
    `${FB_GRAPH}/${pageId}/video_reels?fields=id,description,source,picture,permalink_url` +
    `&limit=25&access_token=${pageToken}`);
  const json = await res.json();
  const items = json.data ?? [];
  const videos: Video[] = items
    .slice(0, 12)
    .map((m: any) => ({
      id: String(m.id),
      title: (m.description ?? "").slice(0, 120),
      thumbnail: m.picture ?? null,
      mediaUrl: m.source ?? null,
    }))
    .filter((v: Video) => v.id && v.mediaUrl);
  if (videos.length === 0) {
    // A Page with genuinely no reels is a normal state — import nothing, no error.
    if (items.length === 0 && !json.error) { return []; }
    // Items came back but none had a playable source — surface for debugging.
    const summary = items.map((m: any) => `${m.id}${m.source ? "+src" : "-src"}`).join(", ");
    const apiErr = json.error ? ` graph-error: ${json.error.message}` : "";
    throw new Error(`FB: no importable reels for page ${pageId}. ${items.length} items: [${summary}]${apiErr}`);
  }
  return videos;
}

// Cheap check used by the Page picker to label Pages that have no reels yet, so they
// get a "No reels" hint instead of being mistaken for an access problem. Unknown
// (probe failed) returns true so we never wrongly tell a creator their Page is empty.
async function facebookPageHasReels(pageId: string, pageToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${FB_GRAPH}/${pageId}/video_reels?fields=id&limit=1&access_token=${pageToken}`);
    const json = await res.json();
    if (json.error) { return true; }
    return Array.isArray(json.data) && json.data.length > 0;
  } catch {
    return true;
  }
}

// Shape the raw Pages into what the picker shows: importable = we hold a manage token;
// hasReels = whether there's anything to import (probed only for manageable Pages, and
// capped so a creator with many Pages doesn't trigger a flood of probes). hasReels is
// null when unknown (not manageable, or beyond the probe cap).
type FacebookPickerPage = FacebookPage & { importable: boolean; hasReels: boolean | null };
async function buildFacebookPicker(pages: FacebookPageWithToken[]): Promise<FacebookPickerPage[]> {
  const out: FacebookPickerPage[] = [];
  let probed = 0;
  for (const p of pages) {
    let hasReels: boolean | null = null;
    if (p.token && probed < 25) {
      probed++;
      hasReels = await facebookPageHasReels(p.id, p.token);
    }
    out.push({ id: p.id, name: p.name, avatar: p.avatar, importable: !!p.token, hasReels });
  }
  return out;
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

    const { provider, code, connectionType, pageId } = await req.json();
    if (provider !== "youtube" && provider !== "tiktok" && provider !== "instagram" && provider !== "facebook") {
      return new Response("bad provider", { status: 400, headers: cors });
    }
    const connType = connectionType === "feed" ? "feed" : "creator";

    // ── Facebook phase 1: list the user's Pages and return them for the in-app picker.
    //    No channel/import happens yet — the user re-invokes with { pageId } to import
    //    (phase 2). Two entry points, both with no pageId:
    //      • code present  → fresh connect: exchange + stash the user token.
    //      • code absent   → resume: reopen the picker for a pending connection using
    //        the already-stashed user token (no second OAuth round-trip needed).
    if (provider === "facebook" && !pageId) {
      let userToken: string;
      if (code) {
        const fbTokens = await facebookExchange(code);
        userToken = fbTokens.access_token;
        // Stash the long-lived USER token on a pending (disabled, no handle) facebook
        // row so phase 2 / resume can derive a Page token without re-authing.
        const { data: pending, error: pErr } = await admin
          .from("synced_accounts")
          .upsert({
            user_id: userId, provider: "facebook", connection_type: connType,
            provider_account_id: "", provider_handle: null, provider_display_name: null,
            provider_avatar_url: null, enabled: false, last_synced_at: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,provider,connection_type" })
          .select("id")
          .single();
        if (pErr) { throw pErr; }
        await admin.from("synced_account_tokens").upsert({
          synced_account_id: pending.id,
          access_token: userToken,
          refresh_token: null,
          token_expires_at: fbTokens.expires_in
            ? new Date(Date.now() + fbTokens.expires_in * 1000).toISOString() : null,
          scopes: null,
          updated_at: new Date().toISOString(),
        });
      } else {
        const { data: acct } = await admin
          .from("synced_accounts").select("id")
          .eq("user_id", userId).eq("provider", "facebook").eq("connection_type", connType)
          .maybeSingle();
        const { data: tok } = acct
          ? await admin.from("synced_account_tokens").select("access_token")
              .eq("synced_account_id", acct.id).maybeSingle()
          : { data: null };
        if (!tok?.access_token) { throw new Error("Facebook session expired — reconnect and try again."); }
        userToken = tok.access_token;
      }
      const pages = await facebookListPages(userToken);
      return new Response(JSON.stringify({
        ok: true, provider, needsPageSelection: true,
        pages: await buildFacebookPicker(pages),
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // 1. Exchange code → tokens, fetch profile + recent videos. (Facebook phase 2 uses
    //    the stashed user token to derive the chosen Page's token + reels instead.)
    let tokens: { access_token: string; refresh_token: string | null; expires_in: number | null; scope: string | null };
    let profile: Profile;
    let videos: Video[];
    if (provider === "facebook") {
      const { data: pendingAcct } = await admin
        .from("synced_accounts").select("id")
        .eq("user_id", userId).eq("provider", "facebook").eq("connection_type", connType)
        .maybeSingle();
      const { data: tok } = pendingAcct
        ? await admin.from("synced_account_tokens").select("access_token")
            .eq("synced_account_id", pendingAcct.id).maybeSingle()
        : { data: null };
      if (!tok?.access_token) { throw new Error("Facebook session expired — reconnect and try again."); }
      const pages = await facebookListPages(tok.access_token);
      const page = pages.find((p) => p.id === String(pageId));
      if (!page) { throw new Error("That Page is no longer available on this account."); }
      if (!page.token) {
        throw new Error("You don't have manage access to that Page, so its reels can't be imported. Ask a Page admin to grant you access, then reconnect.");
      }
      // Going forward we persist the PAGE token (non-expiring) and read its reels.
      tokens = { access_token: page.token, refresh_token: null, expires_in: null, scope: "pages_show_list,pages_read_engagement" };
      profile = { accountId: page.id, handle: page.name, displayName: page.name, avatar: page.avatar };
      videos = await facebookPageReels(page.id, page.token);
    } else {
      tokens = provider === "youtube" ? await youtubeExchange(code)
        : provider === "tiktok" ? await tiktokExchange(code)
        : await instagramExchange(code);
      ({ profile, videos } = provider === "youtube"
        ? await youtubeProfileAndVideos(tokens.access_token)
        : provider === "tiktok" ? await tiktokProfileAndVideos(tokens.access_token)
        : await instagramProfileAndVideos(tokens.access_token));
    }
    const accessToken = tokens.access_token;

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

      // Instagram/Facebook reels come from expiring CDN URLs. Re-host the thumbnail for
      // EVERY fetched reel (stable storage URL) and refresh already-imported posts'
      // thumbnail + title, so a single re-sync backfills old blank/garbled cards.
      const rehost = REHOST_PROVIDERS.has(provider);
      const platform = provider === "facebook" ? "Facebook" : "Instagram";
      const reThumb = new Map<string, string>();
      if (rehost) {
        for (const v of videos) {
          if (!v.thumbnail) { continue; }
          const url = await rehostImage(admin, provider, channel!.id, v.id, v.thumbnail);
          if (url) { reThumb.set(v.id, url); }
        }
        for (const v of videos) {
          if (!have.has(v.id)) { continue; }
          const upd: Record<string, string> = { yt_video_title: cleanCaption(v.title, profile.handle, platform) };
          const t = reThumb.get(v.id);
          if (t) { upd.yt_video_thumbnail = t; }
          await admin.from("channel_posts").update(upd)
            .eq("channel_id", channel!.id).eq("yt_video_id", v.id);
        }
      }

      const fresh = videos.filter(v => !have.has(v.id));
      const rows: any[] = [];
      for (const v of fresh) {
        // Instagram/Facebook source posts play from a re-hosted file (no embed player).
        // Skip a reel we couldn't host — it would be unplayable otherwise.
        let videoUrl: string | null = null;
        let title = v.title;
        let thumbnail = v.thumbnail;
        if (rehost) {
          if (!v.mediaUrl) { continue; }
          videoUrl = await rehostVideo(admin, provider, channel!.id, v.id, v.mediaUrl);
          if (!videoUrl) { continue; }
          title = cleanCaption(v.title, profile.handle, platform);
          thumbnail = reThumb.get(v.id) ?? v.thumbnail;
        }
        rows.push({
          channel_id: channel!.id, poster_id: userId,
          post_type: "youtube", source_type: provider,
          yt_video_id: v.id, yt_video_title: title, yt_video_thumbnail: thumbnail,
          video_url: videoUrl,
          is_pinned: false,
        });
      }
      if (rows.length) { await admin.from("channel_posts").insert(rows); }
      // TEMP diagnostic: all fresh reels failed to re-host to storage.
      if (rehost && fresh.length > 0 && rows.length === 0) {
        throw new Error(`${platform}: re-host failed for all ${fresh.length} reels (check channel-clips bucket).`);
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
