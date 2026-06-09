-- Optional creator-set channel title that overrides the default display:
--  • Members Only channels otherwise show the owner's @handle
--  • Private channels' `name` is auto-managed by update_private_channel_name()
-- display_name is never touched by that trigger, so a rename persists.
alter table public.groups add column if not exists display_name text;
