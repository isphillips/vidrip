import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Profile reactions — playback signing. Given a reactionId, returns a short-lived
// signed URL for the reaction video IFF the owner has opted in
// (users.show_reactions_in_profile = true), or the requester IS the owner.
// Uses the service role to sign from the private `reactions` bucket so viewers who
// aren't members of the reaction's thread can still watch it.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TTL_SECONDS = 60 * 60; // 1h

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// Pull the storage object path out of a stored reactions video_url (public or signed).
function pathFromVideoUrl(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public\/|sign\/)?reactions\/(.+?)(?:\?|$)/);
  return m ? decodeURIComponent(m[1]) : null;
}

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

    const { reactionId } = await req.json().catch(() => ({}));
    if (!reactionId) { return json({ error: "reactionId required" }, 400); }

    const { data: reaction } = await admin
      .from("reactions")
      .select("id, user_id, video_url, storage_mode, duration")
      .eq("id", reactionId).maybeSingle();
    if (!reaction?.video_url) { return json({ error: "not available" }, 404); }
    if (reaction.storage_mode === "deleted") { return json({ error: "not available" }, 404); }

    // Gate: owner always passes; otherwise the owner must have opted in.
    if (reaction.user_id !== userId) {
      const { data: owner } = await admin
        .from("users").select("show_reactions_in_profile").eq("id", reaction.user_id).maybeSingle();
      if (!owner?.show_reactions_in_profile) { return json({ error: "not shared" }, 403); }
    }

    const path = pathFromVideoUrl(reaction.video_url as string);
    if (!path) { return json({ error: "bad video path" }, 500); }

    const { data: signed, error: signErr } = await admin.storage
      .from("reactions").createSignedUrl(path, TTL_SECONDS);
    if (signErr || !signed?.signedUrl) { return json({ error: "could not sign" }, 500); }

    return json({ ok: true, url: signed.signedUrl, duration: reaction.duration ?? null });
  } catch (e: any) {
    console.error("[profile-reaction-sign]", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
