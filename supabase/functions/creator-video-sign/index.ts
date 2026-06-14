import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Creator Studio — playback signing. Returns a short-lived, token-authenticated Bunny
// IFRAME EMBED url for a ready creator post. We use the embed player (not a raw HLS
// URL) because Bunny's player handles token-auth segment delivery internally — native
// HLS players don't forward the token to .ts segment requests, so raw signed HLS 403s.
// Embed token = sha256_hex(tokenAuthKey + videoId + expires).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUNNY_LIBRARY_ID = (Deno.env.get("BUNNY_LIBRARY_ID") ?? "").trim();
const BUNNY_TOKEN_AUTH_KEY = (Deno.env.get("BUNNY_TOKEN_AUTH_KEY") ?? "").trim();

const TTL_SECONDS = 6 * 60 * 60; // signed url valid 6h

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    if (!BUNNY_LIBRARY_ID || !BUNNY_TOKEN_AUTH_KEY) {
      return json({ error: "Bunny token auth not configured." }, 500);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let userId = "";
    try {
      const p = JSON.parse(atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
      if (p.role === "authenticated" && typeof p.sub === "string") { userId = p.sub; }
    } catch { /* malformed */ }
    if (!userId) { return json({ error: "unauthorized" }, 401); }

    const { postId } = await req.json().catch(() => ({}));
    if (!postId) { return json({ error: "postId required" }, 400); }

    const { data: post } = await admin
      .from("channel_posts")
      .select("bunny_video_id, media_status, channel_id, visibility, poster_id")
      .eq("id", postId).maybeSingle();
    if (!post?.bunny_video_id) { return json({ error: "not a creator video" }, 404); }
    if (post.media_status !== "ready") { return json({ error: "not ready", media_status: post.media_status }, 409); }

    // Per-video access gate: 'subscribers' posts require channel membership (the owner
    // always passes); 'public' posts are open to any signed-in user.
    if (post.visibility === "subscribers" && post.poster_id !== userId) {
      const { data: mem } = await admin.from("group_members")
        .select("user_id").eq("group_id", post.channel_id).eq("user_id", userId).maybeSingle();
      if (!mem) { return json({ error: "not entitled" }, 403); }
    }

    const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    const guid = post.bunny_video_id as string;
    const token = await sha256hex(`${BUNNY_TOKEN_AUTH_KEY}${guid}${expires}`);
    const embedUrl =
      `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${guid}` +
      `?token=${token}&expires=${expires}&autoplay=true&preload=true`;

    return json({ ok: true, embedUrl, guid, expires });
  } catch (e: any) {
    console.error("[creator-video-sign]", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
