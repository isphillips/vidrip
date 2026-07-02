// Drain the OLD Supabase-stored hot-updater bundles after the migration to Tigris, while KEEPING the
// current Tigris bundles serving.
//
// Safety model (same as supabase/functions/purge-bundles): a client is always served the NEWEST enabled
// bundle for its (platform, channel, target_app_version) group and runs it from local storage — never
// rolled back. So Supabase bundles are safe to remove once, for EVERY group, the newest enabled bundle
// is on Tigris (storage_uri = https://…). This script verifies that, then deletes exactly the
// supabase-storage:// bundle rows (+ their patches) and empties the Supabase bundle bucket. Tigris
// bundles (https storage_uri) are left untouched.
//
// Usage (reads .env.hotupdater):
//   node scripts/hot-updater/drain-supabase-bundles.mjs            # dry run — report + safety check
//   node scripts/hot-updater/drain-supabase-bundles.mjs --confirm  # delete the old Supabase bundles

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

  const supabaseIds = (rows ?? []).filter(r => isSupabaseUri(r.storage_uri)).map(r => r.id);
  console.log(`Bundles: ${rows?.length ?? 0} total · ${supabaseIds.length} on Supabase (drain) · ${(rows?.length ?? 0) - supabaseIds.length} on Tigris/other (keep)`);

  if (blocking.length) {
    console.error(`\n✋ NOT SAFE to drain — ${blocking.length} group(s) still serve a Supabase bundle as newest-enabled:`);
    for (const b of blocking) console.error(`   ${b.group}  →  ${b.bundleId}`);
    console.error('\nDeploy a Tigris OTA for these groups (so a newer bundle supersedes them), then re-run.');
    process.exit(2);
  }

  if (supabaseIds.length === 0) {
    console.log('\nNothing to drain — no Supabase bundles remain.');
    return;
  }

  if (!CONFIRM) {
    console.log(`\nDRY RUN — pass --confirm to delete ${supabaseIds.length} superseded Supabase bundle row(s) + their patches`);
    console.log(`and empty the "${BUCKET}" bucket. The Tigris bundles keep serving. This is safe (gate passed).`);
    return;
  }

  console.log('\nDraining…');
  // Patches first (in case there's no ON DELETE CASCADE), then the bundle rows, then the storage.
  let patchErr = false;
  for (const ids of chunk(supabaseIds, 100)) {
    const { error: e } = await sb.from('bundle_patches').delete().in('bundle_id', ids);
    if (e && !e.message.includes('does not exist')) { patchErr = true; console.error('  bundle_patches delete:', e.message); }
  }
  if (!patchErr) console.log('  ✓ bundle_patches for Supabase bundles cleared');

  let deleted = 0;
  for (const ids of chunk(supabaseIds, 100)) {
    const { error: e, count: n } = await sb.from('bundles').delete({ count: 'exact' }).in('id', ids);
    if (e) { console.error('  bundles delete:', e.message); process.exit(1); }
    deleted += n ?? ids.length;
  }
  console.log(`  ✓ ${deleted} Supabase bundle row(s) deleted`);

  // All remaining objects in the bucket belong to those (now-deleted) superseded bundles — the Tigris
  // bundles live on Tigris, not here — so emptying the whole bucket is safe and fast.
  const { error: e2 } = await sb.storage.emptyBucket(BUCKET);
  if (e2) console.error(`  emptyBucket("${BUCKET}"):`, e2.message); else console.log(`  ✓ Supabase bucket "${BUCKET}" emptied`);

  console.log('\nDone. Old Supabase bundles are gone; Tigris bundles keep serving. You can now delete the');
  console.log('empty bucket in the Supabase dashboard and remove the supabaseEdgeFunctionStorage adapter');
  console.log('from supabase/functions/update-server/index.ts (no bundle references supabase-storage:// anymore).');
}

main().catch(e => { console.error(e); process.exit(1); });
