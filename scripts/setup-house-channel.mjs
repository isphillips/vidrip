#!/usr/bin/env node
// setup-house-channel — create the "house" bot account + a public auto-channel it owns, idempotently.
//
// The refill (channel-refill edge fn) posts as this account into this channel. Ownership is by
// groups.created_by, so no membership row is needed; the refill writes via the service role.
//
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/setup-house-channel.mjs \
//     --handle vidrip --name "Vidrip" --email house@vidrip.app \
//     --channel "Aww Drip" --channel-desc "Your daily serotonin."
//
// Re-running is safe: an existing account is reused; pass a fresh --channel to add another channel.

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('✖ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

// --- tiny arg parser (--key value) ---
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { args[a.slice(2)] = process.argv[++i]; }
}
const HANDLE   = args.handle  ?? 'vidrip';
const NAME     = args.name    ?? 'Vidrip';
const EMAIL    = args.email   ?? `house+${HANDLE}@vidrip.app`;
const CHANNEL  = args.channel ?? null;            // omit to only ensure the account
const CHAN_DESC = args['channel-desc'] ?? null;

const admin = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function ensureHouseUser() {
  // 1. Auth user (idempotent: reuse if the email already exists).
  let userId;
  const { data: created, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: randomUUID(),          // bot never interactive-logs-in; refill uses the service role
    email_confirm: true,
    user_metadata: { handle: HANDLE, display_name: NAME },
  });
  if (error) {
    const dup = /registered|exists/i.test(error.message ?? '');
    if (!dup) { throw error; }
    const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (lErr) { throw lErr; }
    const existing = list.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());
    if (!existing) { throw new Error(`Email ${EMAIL} reported as existing but not found in listUsers.`); }
    userId = existing.id;
    console.log(`• Reusing existing auth user ${userId}`);
  } else {
    userId = created.user.id;
    console.log(`• Created auth user ${userId}`);
  }

  // 2. Profile row. A signup trigger may already have made it from the metadata above; upsert by id
  //    makes it exist either way (and sets the handle/name). If your users table has extra NOT NULL
  //    columns without defaults, add them here.
  const { error: pErr } = await admin
    .from('users')
    .upsert({ id: userId, handle: HANDLE, display_name: NAME }, { onConflict: 'id' });
  if (pErr) { throw new Error(`profile upsert failed: ${pErr.message}`); }
  console.log(`• Profile ensured: @${HANDLE} (${NAME})`);
  return userId;
}

async function createChannel(ownerId) {
  // Public, listed, browsable video grid (NOT members-only / invite-only / subscriber).
  const { data, error } = await admin
    .from('groups')
    .insert({
      name: CHANNEL,
      description: CHAN_DESC,
      created_by: ownerId,
      is_public: true,
      is_members_only: false,
      invite_only: false,
      subscriber_mode: false,
    })
    .select('id')
    .single();
  if (error) { throw new Error(`channel insert failed: ${error.message}`); }
  console.log(`• Created channel "${CHANNEL}" → ${data.id}`);
  return data.id;
}

(async () => {
  try {
    const houseId = await ensureHouseUser();
    let channelId = null;
    if (CHANNEL) { channelId = await createChannel(houseId); }

    console.log('\n✓ Done.');
    console.log(`  houseAccountId: ${houseId}`);
    if (channelId) {
      console.log(`  channelId:      ${channelId}`);
      console.log('\n  Test the refill:');
      console.log(`  curl -X POST "$SUPABASE_URL/functions/v1/channel-refill" \\
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "content-type: application/json" \\
    -d '{"channelId":"${channelId}","houseAccountId":"${houseId}","strategy":"discover","subreddits":["aww","AnimalsBeingDerps","rarepuppers"],"limit":6,"dripHours":3}'`);
    }
  } catch (e) {
    console.error('\n✖ Setup failed:', e?.message ?? e);
    process.exit(1);
  }
})();
