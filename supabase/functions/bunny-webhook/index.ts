import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Creator Studio — Bunny Stream webhook. Bunny POSTs { VideoLibraryId, VideoGuid,
// Status } as a video moves through encoding. We re-fetch the video details (robust
// vs guessing status codes) and flip the channel_posts row to 'ready' with the HLS
// URL + thumbnail + duration, or 'failed'. Secured by a shared ?secret= query param
// (verify_jwt=false — Bunny sends no JWT).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUNNY_API_KEY = (Deno.env.get("BUNNY_STREAM_API_KEY") ?? "").trim();
const BUNNY_LIBRARY_ID = (Deno.env.get("BUNNY_LIBRARY_ID") ?? "").trim();
const BUNNY_CDN_HOSTNAME = (Deno.env.get("BUNNY_CDN_HOSTNAME") ?? "").trim();
const WEBHOOK_SECRET = (Deno.env.get("BUNNY_WEBHOOK_SECRET") ?? "").trim();

const BUNNY_VIDEO_API = "https://video.bunnycdn.com";
// Bunny status: 0 Created,1 Uploaded,2 Processing,3 Transcoding,4 Finished,5 Error,6 UploadFailed.
const STATUS_FINISHED = 4;

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    if (WEBHOOK_SECRET && url.searchParams.get("secret") !== WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const guid: string = body.VideoGuid ?? body.videoGuid ?? "";
    if (!guid) { return new Response("no guid", { status: 400 }); }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Re-fetch the canonical video state from Bunny rather than trusting the payload.
    let status = Number(body.Status ?? body.status ?? -1);
    let length = 0;
    if (BUNNY_API_KEY && BUNNY_LIBRARY_ID) {
      const det = await fetch(`${BUNNY_VIDEO_API}/library/${BUNNY_LIBRARY_ID}/videos/${guid}`, {
        headers: { AccessKey: BUNNY_API_KEY },
      });
      if (det.ok) {
        const v = await det.json();
        status = Number(v.status ?? status);
        length = Number(v.length ?? 0);   // seconds
      }
    }

    if (status === STATUS_FINISHED) {
      // Thumbnail is set client-side at upload (Bunny's is token-gated) — don't touch it.
      await admin.from("channel_posts").update({
        media_status: "ready",
        video_url: `https://${BUNNY_CDN_HOSTNAME}/${guid}/playlist.m3u8`,
        duration: length || null,
      }).eq("bunny_video_id", guid);
    } else if (status === 5 || status === 6) {
      await admin.from("channel_posts").update({ media_status: "failed" }).eq("bunny_video_id", guid);
    }
    // Intermediate statuses (processing/transcoding) — leave as-is.

    return new Response(JSON.stringify({ ok: true, guid, status }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[bunny-webhook]", e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), { status: 500 });
  }
});
