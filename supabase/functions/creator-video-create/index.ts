import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Creator Studio — step 1. Verifies the caller is flagged creator_studio, creates a
// video in the Bunny Stream library, inserts a channel_posts row (status 'uploading'),
// and returns a TUS upload signature so the client can upload the bytes DIRECTLY to
// Bunny (the API key never leaves the server).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUNNY_API_KEY = (Deno.env.get("BUNNY_STREAM_API_KEY") ?? "").trim();
const BUNNY_LIBRARY_ID = (Deno.env.get("BUNNY_LIBRARY_ID") ?? "").trim();

const BUNNY_VIDEO_API = "https://video.bunnycdn.com";
const TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";

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
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    if (!BUNNY_API_KEY || !BUNNY_LIBRARY_ID) {
      return json({ error: "Bunny not configured (set BUNNY_STREAM_API_KEY + BUNNY_LIBRARY_ID)." }, 500);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Identify caller from the validated JWT (platform verifies the signature).
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let userId = "";
    try {
      const payload = JSON.parse(atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.role === "authenticated" && typeof payload.sub === "string") { userId = payload.sub; }
    } catch { /* malformed */ }
    if (!userId) { return json({ error: "unauthorized" }, 401); }

    // Exclusivity gate — enforced server-side, not just in the UI.
    const { data: u } = await admin.from("users").select("creator_studio").eq("id", userId).maybeSingle();
    if (!u?.creator_studio) { return json({ error: "Creator Studio is not enabled for this account." }, 403); }

    const { channelId, title, visibility, thumbnailUrl, overlayRecipe, releaseDate } = await req.json().catch(() => ({}));
    if (!channelId) { return json({ error: "channelId required" }, 400); }
    const vis = visibility === "subscribers" ? "subscribers" : "public";
    // Animated overlay layer, replayed live in-app. Stored as-is (small JSON); null when absent.
    const recipe = overlayRecipe && typeof overlayRecipe === "object" ? overlayRecipe : null;
    // Scheduled release: a future timestamp hides the post from viewer feeds until it passes (the
    // bytes still upload now). Ignore anything that isn't a valid future date → publish immediately.
    let release: string | null = null;
    if (typeof releaseDate === "string") {
      const t = Date.parse(releaseDate);
      if (!Number.isNaN(t) && t > Date.now()) { release = new Date(t).toISOString(); }
    }

    // The caller must own / be an admin of the destination channel.
    const { data: grp } = await admin.from("groups").select("created_by").eq("id", channelId).maybeSingle();
    let canPost = grp?.created_by === userId;
    if (!canPost) {
      const { data: mem } = await admin.from("group_members")
        .select("role").eq("group_id", channelId).eq("user_id", userId).maybeSingle();
      canPost = mem?.role === "owner" || mem?.role === "admin";
    }
    if (!canPost) { return json({ error: "You can't post to this channel." }, 403); }

    // 1. Create the Bunny video object.
    const createRes = await fetch(`${BUNNY_VIDEO_API}/library/${BUNNY_LIBRARY_ID}/videos`, {
      method: "POST",
      headers: { AccessKey: BUNNY_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ title: (title ?? "").slice(0, 200) || "Untitled" }),
    });
    if (!createRes.ok) { return json({ error: `bunny create: ${await createRes.text()}` }, 502); }
    const guid = (await createRes.json()).guid as string;

    // 2. Insert the post row in 'uploading' state (webhook flips it to 'ready').
    const { data: post, error: insErr } = await admin.from("channel_posts").insert({
      channel_id: channelId,
      poster_id: userId,
      post_type: "creator",
      source_type: "bunny",
      bunny_video_id: guid,
      media_status: "uploading",
      visibility: vis,
      yt_video_title: (title ?? "").slice(0, 200),
      yt_video_thumbnail: typeof thumbnailUrl === "string" ? thumbnailUrl : null,
      overlay_recipe: recipe,
      release_date: release,
      is_pinned: false,
    }).select("id").single();
    if (insErr) { return json({ error: insErr.message }, 500); }

    // 3. TUS signature: SHA256(libraryId + apiKey + expiration + guid). 24h window.
    const expiration = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const signature = await sha256hex(`${BUNNY_LIBRARY_ID}${BUNNY_API_KEY}${expiration}${guid}`);

    return json({
      ok: true,
      guid,
      postId: post.id,
      libraryId: BUNNY_LIBRARY_ID,
      tusEndpoint: TUS_ENDPOINT,
      authorizationSignature: signature,
      authorizationExpire: expiration,
    });
  } catch (e: any) {
    console.error("[creator-video-create]", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
