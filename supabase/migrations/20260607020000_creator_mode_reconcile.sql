-- Creator mode gates Members Only visibility; per-account enable/disable gates
-- that provider's videos within the channel.

-- Per-source-post visibility flag (set by the reconcile function below).
alter table public.channel_posts add column if not exists hidden boolean not null default false;

-- Recompute one creator's Members Only visibility:
--  • channel hidden unless creator mode is ON and at least one account is enabled
--  • each provider's source videos hidden when that creator account is disabled
create or replace function public.reconcile_members_only_for(uid uuid)
returns void language plpgsql security definer as $$
declare has_enabled boolean; creator boolean;
begin
  select exists(select 1 from public.synced_accounts
    where user_id = uid and enabled and connection_type = 'creator') into has_enabled;
  select u.is_creator into creator from public.users u where u.id = uid;

  update public.groups set is_hidden = not (coalesce(has_enabled,false) and coalesce(creator,false))
    where creator_id = uid and is_members_only = true;

  update public.channel_posts cp
  set hidden = not coalesce((
    select sa.enabled from public.synced_accounts sa
    where sa.user_id = uid and sa.connection_type = 'creator' and sa.provider = cp.source_type
    limit 1), false)
  from public.groups g
  where g.creator_id = uid and g.is_members_only = true and cp.channel_id = g.id
    and cp.post_type = 'youtube' and cp.parent_post_id is null;
end $$;

-- Fires on synced_account enable/disable/connect/disconnect.
create or replace function public.reconcile_members_only()
returns trigger language plpgsql security definer as $$
begin
  perform public.reconcile_members_only_for(coalesce(new.user_id, old.user_id));
  return coalesce(new, old);
end $$;

-- Fires when the user flips creator mode.
create or replace function public.reconcile_members_only_on_user()
returns trigger language plpgsql security definer as $$
begin
  perform public.reconcile_members_only_for(new.id);
  return new;
end $$;

drop trigger if exists trg_reconcile_creator on public.users;
create trigger trg_reconcile_creator
  after update of is_creator on public.users
  for each row execute function public.reconcile_members_only_on_user();

-- Backfill: existing creators (have a creator connection) keep creator mode on so
-- their channels stay visible, then resync visibility for everyone.
update public.users set is_creator = true
  where is_creator = false
  and id in (select distinct user_id from public.synced_accounts where connection_type = 'creator');

select public.reconcile_members_only_for(s.user_id)
  from (select distinct user_id from public.synced_accounts where connection_type = 'creator') s;
