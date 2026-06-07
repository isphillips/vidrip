-- device_tokens: allow one token per (user_id, platform) instead of one per user,
-- so a single account can be registered on BOTH an iOS and an Android device.
-- Run this in the Supabase SQL editor. Pairs with the client upsert
-- onConflict: 'user_id,platform' and the send-push function (which now sends to
-- every device row for the user).

-- 0) See the current constraints first (run this alone to learn your names):
--    select conname, contype, pg_get_constraintdef(oid)
--    from pg_constraint where conrelid = 'device_tokens'::regclass;

-- 1) Collapse any duplicate rows, keeping the newest per (user_id, platform).
delete from device_tokens a
using device_tokens b
where a.user_id = b.user_id
  and a.platform = b.platform
  and a.ctid < b.ctid;

-- 2) Drop the old single-column uniqueness on user_id.
--    Default Postgres names are below; adjust if step 0 shows different names.
alter table device_tokens drop constraint if exists device_tokens_user_id_key;
-- If user_id was the PRIMARY KEY (not just unique), also run:
-- alter table device_tokens drop constraint if exists device_tokens_pkey;

-- 3) Add the composite uniqueness used by onConflict: 'user_id,platform'.
alter table device_tokens
  add constraint device_tokens_user_platform_key unique (user_id, platform);
