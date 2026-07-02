// Clean-slate reset for hot-updater OTA bundles — wipes EVERYTHING so the next `hot-updater deploy`
// starts from bundle #1 on Tigris. Use when starting fresh (e.g. right before/after cutting a new
// native build). Removes: all `bundles` + `bundle_patches` rows, all objects in the Supabase bundle
// bucket, and all objects in the Tigris bundle bucket.
//
// Client impact is benign: a device keeps running whatever bundle it already downloaded until its next
// update check, at which point (no enabled bundles) it simply falls back to the bundle built into the
// installed binary. Nothing is destructively rolled back. A fresh build makes that fallback the latest.
//
//   node scripts/hot-updater/reset-hot-updater.mjs            # dry run — counts only
//   node scripts/hot-updater/reset-hot-updater.mjs --confirm  # actually delete everything

import { createClient } from '@supabase/supabase-js';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.hotupdater' });

const {
  HOT_UPDATER_SUPABASE_URL: SB_URL,
  HOT_UPDATER_SUPABASE_SERVICE_ROLE_KEY: SB_KEY,
  HOT_UPDATER_SUPABASE_BUCKET_NAME: SB_BUCKET = 'hot-updater-bundles',
  HOT_UPDATER_S3_ENDPOINT,
  HOT_UPDATER_S3_REGION = 'auto',
  HOT_UPDATER_S3_ACCESS_KEY_ID,
  HOT_UPDATER_S3_SECRET_ACCESS_KEY,
  HOT_UPDATER_S3_BUCKET_NAME,
} = process.env;

const CONFIRM = process.argv.includes('--confirm');
const NIL = '00000000-0000-0000-0000-000000000000';

if (!SB_URL || !SB_KEY) {
  console.error('Missing HOT_UPDATER_SUPABASE_URL / SERVICE_ROLE_KEY in .env.hotupdater');
  process.exit(1);
}

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const s3 = HOT_UPDATER_S3_ENDPOINT
  ? new S3Client({
      region: HOT_UPDATER_S3_REGION,
      endpoint: HOT_UPDATER_S3_ENDPOINT,
      credentials: { accessKeyId: HOT_UPDATER_S3_ACCESS_KEY_ID, secretAccessKey: HOT_UPDATER_S3_SECRET_ACCESS_KEY },
    })
  : null;

async function count(table) {
  const { count: n, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) { return error.message.includes('does not exist') ? null : Promise.reject(error); }
  return n ?? 0;
}

async function emptyTigris(deleteFor) {
  if (!s3 || !HOT_UPDATER_S3_BUCKET_NAME) return 0;
  let removed = 0, ContinuationToken;
  do {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: HOT_UPDATER_S3_BUCKET_NAME, ContinuationToken }));
    const objs = (list.Contents ?? []).map(o => ({ Key: o.Key }));
    if (objs.length && deleteFor) {
      await s3.send(new DeleteObjectsCommand({ Bucket: HOT_UPDATER_S3_BUCKET_NAME, Delete: { Objects: objs } }));
    }
    removed += objs.length;
    ContinuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return removed;
}

async function main() {
  const bundles = await count('bundles');
  const patches = await count('bundle_patches');
  const tigrisObjs = await emptyTigris(false); // count only

  console.log('Current state:');
  console.log(`  bundles rows:        ${bundles}`);
  console.log(`  bundle_patches rows: ${patches ?? '(no table)'}`);
  console.log(`  Tigris objects:      ${tigrisObjs}${s3 ? '' : ' (S3 env not set — skipping)'}`);
  console.log(`  Supabase bucket:     "${SB_BUCKET}" (emptied via emptyBucket())`);

  if (!CONFIRM) {
    console.log('\nDRY RUN — pass --confirm to DELETE all of the above and start fresh.');
    return;
  }

  console.log('\nResetting…');
  // Children first (in case there is no ON DELETE CASCADE), then bundles.
  if (patches !== null) {
    const { error } = await sb.from('bundle_patches').delete().not('bundle_id', 'is', null);
    if (error) console.error('  bundle_patches delete:', error.message); else console.log('  ✓ bundle_patches cleared');
  }
  {
    const { error } = await sb.from('bundles').delete().neq('id', NIL);
    if (error) { console.error('  bundles delete:', error.message); process.exit(1); }
    console.log('  ✓ bundles cleared');
  }
  {
    const { error } = await sb.storage.emptyBucket(SB_BUCKET);
    if (error) console.error(`  emptyBucket("${SB_BUCKET}"):`, error.message); else console.log(`  ✓ Supabase bucket emptied`);
  }
  const removed = await emptyTigris(true);
  console.log(`  ✓ Tigris objects removed: ${removed}`);

  console.log('\nDone — hot-updater is at zero bundles. The next `hot-updater deploy` creates bundle #1 on Tigris.');
}

main().catch(e => { console.error(e); process.exit(1); });
