// Final cleanup of hot-updater bundle FILES left in Supabase Storage after the migration to Tigris.
//
// Safety model (same as supabase/functions/purge-bundles): a client is always served the NEWEST enabled
// bundle for its (platform, channel, target_app_version) group and runs it from local storage — it is
// never rolled back. So Supabase bundle objects are safe to delete once, for EVERY group, the newest
// enabled bundle is on Tigris (storage_uri = https://…). This script verifies that precondition and
// only then empties the Supabase bundle bucket. Old superseded `bundles` rows are left for the existing
// purge-bundles cron to reap (it deletes rows outside the keep-set).
//
// Usage (reads .env.hotupdater):
//   node scripts/hot-updater/drain-supabase-bundles.mjs            # dry run — report only
//   node scripts/hot-updater/drain-supabase-bundles.mjs --confirm  # actually delete
//
// The dry run lists any group still relying on a Supabase bundle (which BLOCKS the wipe) and the object
// count/size that would be removed.

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.hotupdater' });

const URL_ = process.env.HOT_UPDATER_SUPABASE_URL;
const KEY = process.env.HOT_UPDATER_SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.HOT_UPDATER_SUPABASE_BUCKET_NAME ?? 'hot-updater-bundles';
const CONFIRM = process.argv.includes('--confirm');

if (!URL_ || !KEY) {
  console.error('Missing HOT_UPDATER_SUPABASE_URL / HOT_UPDATER_SUPABASE_SERVICE_ROLE_KEY in .env.hotupdater');
  process.exit(1);
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const isSupabaseUri = (u) => typeof u === 'string' && u.startsWith('supabase-storage://');
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

async function walk(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${prefix || '/'}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const it of data) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null && it.metadata == null) out.push(...await walk(p)); // folder
      else out.push({ path: p, size: it.metadata?.size ?? 0 });
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function main() {
  // 1. Safety gate: newest enabled bundle per group must be on Tigris.
  const { data: rows, error } = await sb
    .from('bundles')
    .select('id, platform, channel, target_app_version, enabled, storage_uri');
  if (error) { console.error('bundles query failed:', error.message); process.exit(1); }

  const groups = new Map();
  for (const r of rows ?? []) {
    const k = `${r.platform}|${r.channel}|${r.target_app_version}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push(r);
  }
  const blocking = [];
  for (const [k, arr] of groups) {
    const newestEnabled = arr.filter(r => r.enabled).sort((a, b) => (a.id < b.id ? 1 : -1))[0];
    if (newestEnabled && isSupabaseUri(newestEnabled.storage_uri)) {
      blocking.push({ group: k, bundleId: newestEnabled.id });
    }
  }

  const supabaseRows = (rows ?? []).filter(r => isSupabaseUri(r.storage_uri)).length;
  console.log(`Bundles: ${rows?.length ?? 0} total · ${supabaseRows} still on Supabase · ${(rows?.length ?? 0) - supabaseRows} on Tigris/other`);

  if (blocking.length) {
    console.error(`\n✋ NOT SAFE to wipe — ${blocking.length} group(s) still serve a Supabase bundle as newest-enabled:`);
    for (const b of blocking) console.error(`   ${b.group}  →  ${b.bundleId}`);
    console.error('\nDeploy a Tigris OTA for these groups (so a newer bundle supersedes them), then re-run.');
    process.exit(2);
  }

  // 2. Enumerate + (optionally) delete every object in the bucket.
  console.log(`\nScanning bucket "${BUCKET}"…`);
  const objs = await walk('');
  const totalMB = (objs.reduce((n, o) => n + o.size, 0) / 1_048_576).toFixed(1);
  console.log(`Found ${objs.length} objects (${totalMB} MB).`);
  if (objs.length === 0) { console.log('Nothing to delete — bucket already empty.'); return; }

  if (!CONFIRM) {
    console.log('\nDRY RUN — pass --confirm to delete. All groups are on Tigris, so this is safe.');
    return;
  }

  let removed = 0;
  for (const g of chunk(objs.map(o => o.path), 100)) {
    const { data, error: e } = await sb.storage.from(BUCKET).remove(g);
    if (e) { console.error('remove batch error:', e.message); continue; }
    removed += data?.length ?? 0;
  }
  console.log(`\nDone — removed ${removed}/${objs.length} objects from "${BUCKET}".`);
  console.log('Next: delete the empty bucket in the Supabase dashboard, then remove the');
  console.log('supabaseEdgeFunctionStorage adapter from supabase/functions/update-server/index.ts.');
}

main().catch(e => { console.error(e); process.exit(1); });
