// Retention/cleanup for hot-updater OTA bundles on Tigris — keeps the bucket bounded WITHOUT affecting
// clients. Ported from the old Supabase purge-bundles cron; same safety model:
//
//   A client downloads a bundle once and runs it from local storage, and update-server always serves
//   the NEWEST enabled bundle for the client's (platform, channel, target_app_version). So a client on
//   an old bundle is only ever moved FORWARD on its next check — never rolled back — as long as the
//   newest enabled bundle for its group still exists. The inviolable rule: keep the newest enabled
//   bundle per group. We keep the newest N (rollback headroom) + anything inside a grace window, and
//   delete the rest:
//     1. delete the DB row first (update-server stops referencing it immediately), then
//     2. delete its Tigris objects (the `<id>/` prefix — bundle + patches), and
//     3. a content-addressed asset GC: assets live at assets/… and are shared, so keep only the hashes
//        referenced by a surviving manifest and drop the rest. If any surviving manifest can't be read,
//        SKIP asset GC entirely rather than risk deleting a live asset.
//
// Because deleting a superseded bundle never affects a client, this is safe to run at ANY cadence —
// weekly, or after every deploy. Grace only guards against in-flight downloads/deploys.
//
// Usage (reads .env.hotupdater; or env from CI secrets):
//   node scripts/hot-updater/purge-tigris-bundles.mjs            # dry run — report what WOULD be removed
//   node scripts/hot-updater/purge-tigris-bundles.mjs --confirm  # delete
// Tunables: PURGE_KEEP_PER_GROUP (default 2), PURGE_GRACE_DAYS (default 14), PURGE_ASSET_GC (default true).

import { createClient } from '@supabase/supabase-js';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.hotupdater' });

const SB_URL = process.env.HOT_UPDATER_SUPABASE_URL;
const SB_KEY = process.env.HOT_UPDATER_SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.HOT_UPDATER_S3_BUCKET_NAME;
const KEEP_PER_GROUP = Number(process.env.PURGE_KEEP_PER_GROUP ?? '2');
const GRACE_DAYS = Number(process.env.PURGE_GRACE_DAYS ?? '14');
const ASSET_GC = (process.env.PURGE_ASSET_GC ?? 'true') !== 'false';
const CONFIRM = process.argv.includes('--confirm');
const GRACE_MS = GRACE_DAYS * 86_400_000;

if (!SB_URL || !SB_KEY || !BUCKET || !process.env.HOT_UPDATER_S3_ENDPOINT) {
  console.error('Missing Supabase and/or Tigris env in .env.hotupdater (need SUPABASE_URL/SERVICE_ROLE_KEY + S3_*).');
  process.exit(1);
}

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const s3 = new S3Client({
  region: process.env.HOT_UPDATER_S3_REGION ?? 'auto',
  endpoint: process.env.HOT_UPDATER_S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.HOT_UPDATER_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.HOT_UPDATER_S3_SECRET_ACCESS_KEY,
  },
});

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
// hot-updater bundle ids are UUIDv7 → first 48 bits are the unix-ms creation time.
const v7ms = (id) => parseInt(id.replace(/-/g, '').slice(0, 12), 16);

async function listKeys(prefix) {
  const keys = [];
  let ContinuationToken;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken }));
    for (const o of r.Contents ?? []) keys.push({ Key: o.Key, updated: o.LastModified ? o.LastModified.getTime() : 0 });
    ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

async function deleteKeys(keys, dryRun) {
  if (dryRun || keys.length === 0) return keys.length;
  let n = 0;
  for (const g of chunk(keys, 1000)) {
    await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: g.map(Key => ({ Key })) } }));
    n += g.length;
  }
  return n;
}

async function main() {
  const now = Date.now();
  const dryRun = !CONFIRM;
  const summary = { dryRun, bucket: BUCKET, keepPerGroup: KEEP_PER_GROUP, graceDays: GRACE_DAYS, assetGc: ASSET_GC };

  // 1. Which bundle rows survive.
  const { data: rows, error } = await sb
    .from('bundles')
    .select('id, platform, channel, target_app_version, enabled, storage_uri, manifest_storage_uri');
  if (error) { console.error('bundles query failed:', error.message); process.exit(1); }

  // Only manage Tigris bundles here (https storage_uri). Anything else (legacy) is out of scope.
  const tigris = (rows ?? []).filter(r => typeof r.storage_uri === 'string' && r.storage_uri.startsWith('https://'));

  const groups = new Map();
  for (const r of tigris) {
    const k = `${r.platform}|${r.channel}|${r.target_app_version}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push(r);
  }
  const keepIds = new Set();
  for (const arr of groups.values()) {
    arr.filter(r => r.enabled).sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, KEEP_PER_GROUP).forEach(r => keepIds.add(r.id));
  }
  for (const r of tigris) if (now - v7ms(r.id) < GRACE_MS) keepIds.add(r.id); // grace window

  if (tigris.length > 0 && keepIds.size === 0) {
    console.error('refusing: computed keep set is empty'); process.exit(1);
  }

  const del = tigris.filter(r => !keepIds.has(r.id));
  summary.bundlesTotal = tigris.length;
  summary.bundlesKept = keepIds.size;
  summary.bundlesDeleted = del.length;

  // 2. Delete DB rows first (server stops serving them).
  if (!dryRun && del.length) {
    const ids = del.map(r => r.id);
    for (const g of chunk(ids, 100)) {
      await sb.from('bundle_patches').delete().in('bundle_id', g).then(({ error: e }) => {
        if (e && !e.message.includes('does not exist')) console.error('bundle_patches delete:', e.message);
      });
    }
    for (const g of chunk(ids, 100)) {
      const { error: e } = await sb.from('bundles').delete().in('id', g);
      if (e) { console.error('bundles delete:', e.message); process.exit(1); }
    }
  }

  // 3. Delete each removed bundle's Tigris objects (the `<id>/` prefix).
  const bundleKeys = [];
  for (const r of del) bundleKeys.push(...(await listKeys(`${r.id}/`)).map(o => o.Key));
  summary.storageObjectsDeleted = await deleteKeys(bundleKeys, dryRun);

  // 4. Content-addressed asset GC — keep only hashes referenced by a surviving manifest.
  if (ASSET_GC) {
    const keepHashes = new Set();
    let manifestsOk = true;
    for (const r of tigris.filter(r => keepIds.has(r.id))) {
      const url = r.manifest_storage_uri;
      if (!url || !url.startsWith('https://')) { manifestsOk = false; break; }
      try {
        const res = await fetch(url);
        if (!res.ok) { manifestsOk = false; break; }
        const m = await res.json();
        for (const k of Object.keys(m?.assets ?? {})) {
          const h = m.assets[k]?.fileHash;
          if (h) keepHashes.add(String(h));
        }
      } catch { manifestsOk = false; break; }
    }
    if (!manifestsOk) {
      summary.assetGcResult = 'skipped: a surviving manifest could not be read (won\'t risk live assets)';
    } else {
      const assets = await listKeys('assets/');
      const delAssets = assets.filter(o => {
        const leaf = o.Key.split('/').pop();
        const hash = leaf.replace(/\.[^.]+$/, '');
        return !keepHashes.has(leaf) && !keepHashes.has(hash) && now - o.updated > GRACE_MS;
      }).map(o => o.Key);
      summary.assetsReferenced = keepHashes.size;
      summary.assetsScanned = assets.length;
      summary.assetsDeleted = await deleteKeys(delAssets, dryRun);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
