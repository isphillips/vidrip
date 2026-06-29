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

// Supabase error objects (AuthError / PostgrestError) carry their useful fields non-enumerably, so a
// bare `${e}` / e.message prints "{}". Pull out everything that matters.
function describe(e) {
  if (!e) { return String(e); }
  const pick = {};
  for (const k of ['name', 'message', 'status', 'code', 'details', 'hint', 'error', 'error_description']) {
    if (e[k] != null && e[k] !== '') { pick[k] = e[k]; }
  }
  if (Object.keys(pick).length) { return JSON.stringify(pick); }
  try { return JSON.stringify(e, Object.getOwnPropertyNames(e)); } catch { return String(e); }
}
const fail = (where, e) => { throw new Error(`${where}: ${describe(e)}`); };

async function ensureHouseUser() {
  // 0. Reuse by handle first — the signup trigger creates a public.users row from the metadata, so a
  //    prior (even partly-failed) run leaves a profile we can resolve WITHOUT the flaky admin listUsers
  //    endpoint (which 500s here).
  {
    const { data: prof, error: e } = await admin.from('users').select('id').eq('handle', HANDLE).maybeSingle();
    if (e) { fail('lookup profile by handle', e); }
    if (prof?.id) {
      await admin.from('users').update({ display_name: NAME }).eq('id', prof.id);
      console.log(`• Reusing existing user @${HANDLE} → ${prof.id}`);
      return prof.id;
    }
  }

  // 1. Otherwise create the auth user (the trigger then makes the profile from the metadata).
  let userId;
  const { data: created, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: randomUUID(),          // bot never interactive-logs-in; refill uses the service role
    email_confirm: true,
    user_metadata: { handle: HANDLE, display_name: NAME },
  });
  if (error) {
    // Email exists but no profile row was found above → resolve the id via admin listUsers (small page).
    const { data: list, error: lErr } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (lErr) { fail(`listUsers (email exists: ${describe(error)})`, lErr); }
    const existing = list.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());
    if (!existing) { fail('resolve existing email', new Error(`${EMAIL} registered but not in first page`)); }
    userId = existing.id;
    console.log(`• Reusing existing auth user ${userId}`);
  } else {
    userId = created.user.id;
    console.log(`• Created auth user ${userId}`);
  }

  // 2. Ensure the profile row exists (upsert by id; covers the no-trigger case + sets handle/name).
  const { error: pErr } = await admin
    .from('users')
    .upsert({ id: userId, handle: HANDLE, display_name: NAME }, { onConflict: 'id' });
  if (pErr) { fail('profile upsert', pErr); }
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
  if (error) { fail('channel insert', error); }
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
      console.log('\n  Test the refill (needs the channel-refill fn deployed + YOUTUBE_API_KEY set):');
      console.log(`  curl -X POST "$SUPABASE_URL/functions/v1/channel-refill" \\
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "content-type: application/json" \\
    -d '{"channelId":"${channelId}","houseAccountId":"${houseId}","strategy":"discover","youtubeQuery":["cute animals","funny pets"],"shortsOnly":true,"limit":6,"dripHours":3}'`);
    }
  } catch (e) {
    console.error('\n✖ Setup failed:', e?.message ?? e);
    process.exit(1);
  }
})();
