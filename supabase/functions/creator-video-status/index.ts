import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Creator Studio — on-demand status refresh. Same logic as the Bunny webhook, but pulled by the
// creator from the studio list (a fallback for when the webhook is delayed or not yet delivered).
// Auth: the caller must be the post's owner. Re-fetches the canonical video state from Bunny and
// flips the channel_posts row to ready / processing / failed, then returns the new media_status.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUNNY_API_KEY = (Deno.env.get("BUNNY_STREAM_API_KEY") ?? "").trim();
const BUNNY_LIBRARY_ID = (Deno.env.get("BUNNY_LIBRARY_ID") ?? "").trim();
const BUNNY_CDN_HOSTNAME = (Deno.env.get("BUNNY_CDN_HOSTNAME") ?? "").trim();
const BUNNY_VIDEO_API = "https://video.bunnycdn.com";
const STATUS_FINISHED = 4; // 0 Created,1 Uploaded,2 Processing,3 Transcoding,4 Finished,5 Error,6 UploadFailed

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
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
      .select("bunny_video_id, media_status, poster_id")
      .eq("id", postId).maybeSingle();
    if (!post?.bunny_video_id) { return json({ error: "not a creator video" }, 404); }
    if (post.poster_id !== userId) { return json({ error: "forbidden" }, 403); }
    if (post.media_status === "ready") { return json({ ok: true, mediaStatus: "ready" }); }

    if (!BUNNY_API_KEY || !BUNNY_LIBRARY_ID) { return json({ ok: true, mediaStatus: post.media_status }); }
    const guid = post.bunny_video_id as string;
    const det = await fetch(`${BUNNY_VIDEO_API}/library/${BUNNY_LIBRARY_ID}/videos/${guid}`, {
      headers: { AccessKey: BUNNY_API_KEY },
    });
    if (!det.ok) { return json({ ok: true, mediaStatus: post.media_status }); }
    const v = await det.json();
    const status = Number(v.status ?? -1);
    const length = Number(v.length ?? 0);

    let mediaStatus = post.media_status;
    if (status === STATUS_FINISHED) {
      mediaStatus = "ready";
      await admin.from("channel_posts").update({
        media_status: "ready",
        video_url: `https://${BUNNY_CDN_HOSTNAME}/${guid}/playlist.m3u8`,
        duration: length || null,
      }).eq("bunny_video_id", guid);
    } else if (status === 5 || status === 6) {
      mediaStatus = "failed";
      await admin.from("channel_posts").update({ media_status: "failed" }).eq("bunny_video_id", guid);
    } else if (status === 2 || status === 3) {
      mediaStatus = "processing";
      await admin.from("channel_posts").update({ media_status: "processing" })
        .eq("bunny_video_id", guid).neq("media_status", "ready");
    }

    return json({ ok: true, mediaStatus });
  } catch (e: any) {
    console.error("[creator-video-status]", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
