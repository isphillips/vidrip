-- FOLLOW-UP — apply ONLY after these are deployed with created_by:
--   • app edge function: supabase functions deploy sync-oauth
--   • app bundle (channels.ts) — build/OTA
--   • web server (server/src/auth.ts) + Cloudflare Pages function (functions/_lib.ts)
-- Until then the live code still reads/writes creator_id; dropping it early would
-- break sign-in ownership checks and creator-mode sync.
alter table public.groups drop column if exists creator_id;
