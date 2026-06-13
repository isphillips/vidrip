-- FINAL CLEANUP — drops the now-redundant duplicate columns. Apply ONLY after the
-- following are deployed off creator_id / groups.display_name and onto created_by /
-- groups.name:
--   • app edge function:  supabase functions deploy sync-oauth
--   • app bundle (channels.ts, ChannelCard, ChannelSettingsSheet) — build / OTA
--   • web server (server/src/auth.ts) + Cloudflare Pages function (functions/_lib.ts)
-- Until then the live code still references these columns; dropping early would
-- break sign-in ownership checks, creator-mode sync, and channel titles.
alter table public.groups drop column if exists creator_id;
alter table public.groups drop column if exists display_name;
