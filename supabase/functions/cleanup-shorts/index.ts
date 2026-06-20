import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Removes rows from the `shorts` discovery feed whose YouTube video is no longer playable — deleted,
// set private, channel terminated, embedding disabled, or upload failed/rejected. The fetchers already
// prune by age (fetched_at < 7d); this prunes "dead within the window" so the feed never shows a
// blank/unavailable card. Cheap: videos.list is 1 quota unit per 50 ids (vs 100 for search).
//
// Auth: x-internal-secret header (same as the fetch-* functions). Trigger on a schedule (every ~3h),
// ideally a beat after the ingest. Pass ?dryRun=1 (or body {"dryRun":true}) to report dead ids
// WITHOUT deleting.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const YOUTUBE_API_KEY = (Deno.env.get("YOUTUBE_API_KEY_MP") ?? "").trim();
const INTERNAL_SECRET = (Deno.env.get("INTERNAL_SECRET") ?? "").trim();

const YT = "https://www.googleapis.com/youtube/v3";
const ID_BATCH = 50;     // videos.list hard max per call
const DELETE_BATCH = 200; // keep the IN (...) list well under Postgres limits

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) { out.push(arr.slice(i, i + n)); }
  return out;
}

// For up to 50 ids, return the set that are ALIVE + playable. Returns null if the API call failed —
// the caller then SKIPS the batch (we never delete on a transient error / "no response" ≠ "deleted").
async function aliveIds(ids: string[]): Promise<Set<string> | null> {
  const params = new URLSearchParams({ part: "status", id: ids.join(","), key: YOUTUBE_API_KEY });
  let res: Response;
  try { res = await fetch(`${YT}/videos?${params.toString()}`); }
  catch (e) { console.error("[cleanup-shorts] videos.list threw:", e); return null; }
  if (!res.ok) { console.error("[cleanup-shorts] videos.list", res.status, await res.text().catch(() => "")); return null; }
  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.items)) { return null; }

  // A deleted / private (to us) / terminated video is simply ABSENT from items → it won't be added
  // here → it'll be counted dead by the caller. Present-but-unplayable (embedding off, upload bad) is
  // also dropped. Unlisted/public stay (they still play in the iframe).
  const alive = new Set<string>();
  for (const it of data.items) {
    const s = it.status ?? {};
    const badUpload = ["failed", "rejected", "deleted"].includes(s.uploadStatus ?? "");
    const playable = s.embeddable !== false && !badUpload;
    if (it.id && playable) { alive.add(it.id); }
  }
  return alive;
}

Deno.serve(async (req) => {
  if (!INTERNAL_SECRET || req.headers.get("x-internal-secret") !== INTERNAL_SECRET) {
    return json({ error: "forbidden" }, 403);
  }
  if (!YOUTUBE_API_KEY) { return json({ error: "YOUTUBE_API_KEY_MP not set" }, 500); }

  // Dry run: ?dryRun=1 or JSON body {"dryRun": true} → compute + report, delete nothing.
  let dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  try { const b = await req.json(); if (b && typeof b.dryRun === "boolean") { dryRun = b.dryRun; } } catch { /* no body */ }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: rows, error } = await admin.from("shorts").select("video_id");
    if (error) { return json({ error: error.message }, 500); }
    const ids = (rows ?? []).map((r: { video_id: string }) => r.video_id).filter(Boolean);

    const dead: string[] = [];
    let checked = 0;
    let failedBatches = 0;
    for (const batch of chunk(ids, ID_BATCH)) {
      const alive = await aliveIds(batch);
      if (!alive) { failedBatches++; continue; } // API failed → leave this batch alone
      checked += batch.length;
      for (const id of batch) { if (!alive.has(id)) { dead.push(id); } }
    }

    let deleted = 0;
    if (!dryRun && dead.length) {
      for (const del of chunk(dead, DELETE_BATCH)) {
        const { error: rmErr } = await admin.from("shorts").delete().in("video_id", del);
        if (rmErr) { console.error("[cleanup-shorts] delete failed:", rmErr.message); continue; }
        deleted += del.length;
      }
    }

    console.log(`[cleanup-shorts] total=${ids.length} checked=${checked} dead=${dead.length} deleted=${deleted} failedBatches=${failedBatches} dryRun=${dryRun}`);
    return json({
      ok: true,
      total: ids.length,
      checked,
      dead: dead.length,
      deleted,
      failedBatches,
      dryRun,
      ...(dryRun ? { deadIds: dead } : {}),
    });
  } catch (e: any) {
    console.error("[cleanup-shorts]", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
