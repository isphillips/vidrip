import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Auto-purge superseded hot-updater OTA bundles so the bucket stays bounded — WITHOUT affecting
// clients. Safety model: a client downloads a bundle once and runs it from local device storage, and
// update-server always serves the NEWEST enabled bundle for the client's
// (platform, channel, target_app_version). So a client on an old bundle is simply moved forward on
// its next check — never rolled back — as long as the newest bundle for its group still exists.
// Therefore the inviolable rule is: keep the newest enabled bundle per group. We keep the newest N
// (rollback headroom) plus anything inside a grace window, and delete the rest:
//   1. delete the DB row first (update-server immediately stops referencing it), then
//   2. a RECURSIVE storage sweep of its `<id>/` folder — which also reaps nested patches/ and any
//      ORPHAN `<id>/` folders left by failed/aborted deploys (the gap a row-only delete leaves), and
//   3. a content-addressed asset GC: assets live at assets/sha256/<fileHash> and are shared, so we
//      keep only the hashes referenced by a surviving manifest and drop the rest. If any surviving
//      manifest can't be read we SKIP asset GC entirely rather than risk deleting a live asset.
//
// Auth: x-internal-secret header (same as the other internal cron functions); verify_jwt = false.
// Schedule weekly via pg_cron — see ./schedule.sql. Pass ?dryRun=1 (or body {"dryRun":true}) to
// compute + report what WOULD be removed without deleting anything.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = (Deno.env.get("INTERNAL_SECRET") ?? "").trim();
const BUCKET = (Deno.env.get("HOT_UPDATER_BUCKET") ?? "hot-updater-bundles").trim();
const KEEP_PER_GROUP = Number(Deno.env.get("PURGE_KEEP_PER_GROUP") ?? "2");
const GRACE_DAYS = Number(Deno.env.get("PURGE_GRACE_DAYS") ?? "14");
const ASSET_GC = (Deno.env.get("PURGE_ASSET_GC") ?? "true") !== "false";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const GRACE_MS = GRACE_DAYS * 86_400_000;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), { status, headers: { "Content-Type": "application/json" } });

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

// hot-updater bundle ids are UUIDv7 → the first 48 bits are the unix-ms creation time. Lets us derive
// "newest" (lexicographic id sort) and a grace window with no created_at column.
const v7ms = (id: string): number => parseInt(id.replace(/-/g, "").slice(0, 12), 16);
const isV7 = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/.test(s);

type Obj = { path: string; size: number; updated: number };
async function walk(prefix: string): Promise<Obj[]> {
  const out: Obj[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${prefix || "/"}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const it of data as any[]) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null && it.metadata == null) out.push(...await walk(p)); // folder
      else out.push({ path: p, size: it.metadata?.size ?? 0, updated: it.updated_at ? Date.parse(it.updated_at) : 0 });
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function removeAll(paths: string[], dryRun: boolean): Promise<number> {
  if (dryRun || paths.length === 0) return paths.length;
  let n = 0;
  for (const g of chunk(paths, 100)) {
    const { data, error } = await sb.storage.from(BUCKET).remove(g);
    if (error) { console.error("[purge-bundles] remove:", error.message); continue; }
    n += data?.length ?? 0;
  }
  return n;
}

Deno.serve(async (req) => {
  if (!INTERNAL_SECRET || req.headers.get("x-internal-secret") !== INTERNAL_SECRET) {
    return json({ error: "forbidden" }, 403);
  }

  let dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  try { const b = await req.json(); if (b?.dryRun) dryRun = true; } catch { /* no/invalid body */ }

  const now = Date.now();
  const summary: Record<string, unknown> = {
    dryRun, bucket: BUCKET, keepPerGroup: KEEP_PER_GROUP, graceDays: GRACE_DAYS, assetGc: ASSET_GC,
  };

  // ── 1. Decide which bundle rows survive ──────────────────────────────────────
  const { data: rows, error } = await sb
    .from("bundles")
    .select("id, platform, channel, target_app_version, enabled");
  if (error) return json({ error: error.message }, 500);

  const groups = new Map<string, any[]>();
  for (const r of rows as any[]) {
    const k = `${r.platform}|${r.channel}|${r.target_app_version}`;
    const arr = groups.get(k) ?? groups.set(k, []).get(k)!;
    arr.push(r);
  }
  const keepIds = new Set<string>();
  for (const arr of groups.values()) {
    arr.filter((r) => r.enabled)
      .sort((a, b) => (a.id < b.id ? 1 : -1)) // newest (UUIDv7) first
      .slice(0, KEEP_PER_GROUP)
      .forEach((r) => keepIds.add(r.id));
  }
  for (const r of rows as any[]) if (now - v7ms(r.id) < GRACE_MS) keepIds.add(r.id); // grace window

  // Corruption guard: with bundles present we must always keep at least one (the newest per group).
  if ((rows as any[]).length > 0 && keepIds.size === 0) {
    return json({ error: "refusing: computed keep set is empty", summary }, 500);
  }

  const delRows = (rows as any[]).filter((r) => !keepIds.has(r.id));
  summary.bundlesTotal = (rows as any[]).length;
  summary.bundlesKept = keepIds.size;
  summary.bundlesDeleted = delRows.length;

  // ── 2. Delete DB rows first (server stops serving them), batched ─────────────
  if (!dryRun && delRows.length) {
    for (const ids of chunk(delRows.map((r) => r.id), 100)) {
      const { error: e } = await sb.from("bundles").delete().in("id", ids);
      if (e) return json({ error: `db delete: ${e.message}`, summary }, 500);
    }
  }

  // ── 3. Recursive storage sweep: keep assets/ + surviving folders; reap the rest ─
  // (old bundles, nested patches/, and orphan `<id>/` folders), protecting in-grace folders.
  const { data: root, error: rerr } = await sb.storage.from(BUCKET).list("", { limit: 10000 });
  if (rerr) return json({ error: `root list: ${rerr.message}`, summary }, 500);
  const keepFolders = new Set<string>(["assets", ...keepIds]);
  const sweepPaths: string[] = [];
  for (const e of root as any[]) {
    if (e.id !== null || e.metadata != null) continue; // skip stray root files
    if (keepFolders.has(e.name)) continue;
    if (isV7(e.name) && now - v7ms(e.name) < GRACE_MS) continue; // protect an in-flight deploy
    sweepPaths.push(...(await walk(e.name)).map((f) => f.path));
  }
  summary.storageFilesSwept = await removeAll(sweepPaths, dryRun);

  // ── 4. Content-addressed asset GC ────────────────────────────────────────────
  if (ASSET_GC) {
    const keepHashes = new Set<string>();
    let manifestsOk = true;
    for (const id of keepIds) {
      try {
        const { data, error: de } = await sb.storage.from(BUCKET).download(`${id}/manifest.json`);
        if (de || !data) { manifestsOk = false; break; }
        const m = JSON.parse(await data.text());
        for (const k of Object.keys(m?.assets ?? {})) {
          const h = m.assets[k]?.fileHash;
          if (h) keepHashes.add(String(h));
        }
      } catch { manifestsOk = false; break; }
    }
    if (!manifestsOk) {
      summary.assetGcResult = "skipped: a surviving manifest could not be read (won't risk live assets)";
    } else {
      const assetObjs = await walk("assets");
      const delAssets = assetObjs.filter((f) => {
        const leaf = f.path.split("/").pop()!;
        const hash = leaf.replace(/\.[^.]+$/, "");
        return !keepHashes.has(leaf) && !keepHashes.has(hash) && now - f.updated > GRACE_MS;
      }).map((f) => f.path);
      summary.assetsReferenced = keepHashes.size;
      summary.assetsScanned = assetObjs.length;
      summary.assetsDeleted = await removeAll(delAssets, dryRun);
    }
  }

  console.log("[purge-bundles]", JSON.stringify(summary));
  return json(summary);
});
