import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();

// Per-category block thresholds on OpenAI omni-moderation `category_scores` (0..1).
// Tuned for short selfie-style reaction videos: nudity/sexual content is the main
// concern (indecent exposure), with near-zero tolerance for anything involving minors.
const THRESHOLDS: Record<string, number> = {
  "sexual": 0.75,
  "sexual/minors": 0.2,
};

// User-facing rejection copy. Deliberately vague for the minors case.
function rejectionMessage(tripped: string[]): string {
  if (tripped.includes("sexual/minors")) {
    return "This video can't be posted.";
  }
  return "This video can't be posted because it appears to contain nudity or sexually explicit content.";
}

const BATCH = 16;       // images per OpenAI moderation request (chunk large clips).
const MAX_FRAMES = 120; // hard cap on frames scored per clip (matches client sampling).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Score one batch of base64 JPEG frames; returns the max score per category.
async function moderateBatch(b64Frames: string[]): Promise<Record<string, number> | null> {
  const input = b64Frames.map((b64) => ({
    type: "image_url",
    image_url: { url: `data:image/jpeg;base64,${b64}` },
  }));
  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "omni-moderation-latest", input }),
  });
  if (!res.ok) {
    console.error("[moderate-frames] openai error:", await res.text().catch(() => ""));
    return null;
  }
  const body = await res.json();
  const max: Record<string, number> = {};
  for (const r of (body.results ?? [])) {
    for (const [cat, score] of Object.entries(r.category_scores ?? {})) {
      const s = Number(score) || 0;
      if (!(cat in max) || s > max[cat]) { max[cat] = s; }
    }
  }
  return max;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Trust the platform-verified JWT (verify_jwt=true).
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let userId = "";
    try {
      const p = JSON.parse(atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
      if (p.role === "authenticated" && typeof p.sub === "string") { userId = p.sub; }
    } catch { /* malformed */ }
    if (!userId) { return json({ error: "unauthorized" }, 401); }

    const { frames, contentType } = await req.json();
    if (!Array.isArray(frames) || frames.length === 0) {
      // Nothing to score — fail open so extraction hiccups don't block posting.
      return json({ allowed: true, skipped: "no_frames" });
    }
    // No key configured → fail open (don't block the whole app on a missing secret).
    if (!OPENAI_API_KEY) {
      return json({ allowed: true, skipped: "no_key" });
    }

    // Score frames in batches, keeping the worst score per category. Early-exit the
    // moment a batch trips a threshold — a clearly-bad clip rejects without burning
    // calls on the rest. A failed batch (provider hiccup) is skipped, not fatal.
    const allFrames: string[] = frames.slice(0, MAX_FRAMES);
    const maxScores: Record<string, number> = {};
    let tripped: string[] = [];
    let scored = 0;
    for (let i = 0; i < allFrames.length; i += BATCH) {
      const batchMax = await moderateBatch(allFrames.slice(i, i + BATCH));
      if (!batchMax) { continue; }
      scored += 1;
      for (const [cat, s] of Object.entries(batchMax)) {
        if (!(cat in maxScores) || s > maxScores[cat]) { maxScores[cat] = s; }
      }
      tripped = Object.entries(THRESHOLDS)
        .filter(([cat, th]) => (maxScores[cat] ?? 0) >= th)
        .map(([cat]) => cat);
      if (tripped.length > 0) { break; }
    }

    // Every batch errored → couldn't actually check; fail open but log it.
    if (scored === 0) {
      await admin.from("moderation_events").insert({
        user_id: userId, content_type: contentType ?? null, allowed: true,
        tripped_categories: [], scores: {}, frame_count: frames.length,
      });
      return json({ allowed: true, skipped: "provider_error" });
    }

    const allowed = tripped.length === 0;

    // Log every check (pass or block) for auditing.
    await admin.from("moderation_events").insert({
      user_id: userId,
      content_type: contentType ?? null,
      allowed,
      tripped_categories: tripped,
      scores: maxScores,
      frame_count: frames.length,
    });

    if (allowed) { return json({ allowed: true }); }
    return json({ allowed: false, categories: tripped, message: rejectionMessage(tripped) });
  } catch (e: any) {
    // Never hard-fail the user flow on an internal error — fail open.
    console.error("[moderate-frames]", e);
    return json({ allowed: true, skipped: "exception" });
  }
});
