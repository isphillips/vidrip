-- Consolidate duplicate columns: standardize on groups.created_by (creator_id is
-- redundant — identical wherever both are set) and roll the creator's display_name
-- into the private room's name. The creator_id column is dropped in a FOLLOW-UP
-- migration, only after the app (sync-oauth) + web (server/functions) are deployed
-- using created_by.

-- 1. Roll the channel's durable title (groups.display_name) into groups.name. The
--    app historically wrote display_name because `name` was trigger-managed, but
--    that trigger only renames is_public=false group chats — not channels — so
--    `name` is safe to use. (groups.display_name is dropped in the app-rewire phase.)
update public.groups
set name = display_name
where display_name is not null and display_name <> '';

-- 2. Reconcile function: key off created_by instead of the redundant creator_id.
create or replace function public.reconcile_members_only_for(uid uuid)
returns void language plpgsql security definer as $$
declare has_enabled boolean; creator boolean;
begin
  select exists(select 1 from public.synced_accounts
    where user_id = uid and enabled and connection_type = 'creator') into has_enabled;
  select u.is_creator into creator from public.users u where u.id = uid;

  update public.groups set is_hidden = not (coalesce(has_enabled,false) and coalesce(creator,false))
    where created_by = uid and is_members_only = true;

  update public.channel_posts cp
  set hidden = not coalesce((
    select sa.enabled from public.synced_accounts sa
    where sa.user_id = uid and sa.connection_type = 'creator' and sa.provider = cp.source_type
    limit 1), false)
  from public.groups g
  where g.created_by = uid and g.is_members_only = true and cp.channel_id = g.id
    and cp.post_type = 'youtube' and cp.parent_post_id is null;
end $$;
