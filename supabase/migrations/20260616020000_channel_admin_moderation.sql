-- Part B: channel admin role + member moderation (mute/kick/ban/promote).
-- Applied live via the Management API 2026-06-16; kept here as a record. Idempotent.
-- NOTE: server-side enforcement of mute/ban on channel_posts/group_members INSERT is applied
-- separately (ALTER POLICY) after testing; this file is the core role/RPC layer.

-- Timed mute on membership: read-only in the channel until muted_until passes (null = not muted).
alter table public.group_members add column if not exists muted_until timestamptz;

-- Ban list (channel-scoped; blocks rejoin).
create table if not exists public.channel_bans (
  channel_id uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  banned_by  uuid,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
alter table public.channel_bans enable row level security;
grant select on public.channel_bans to authenticated;

-- Effective role of a user in a channel: 'owner' (created_by) | their group_members.role | null.
create or replace function public._channel_role(p_channel uuid, p_user uuid)
returns text language sql security definer set search_path = public stable as $$
  select case
    when exists (select 1 from public.groups g where g.id = p_channel and g.created_by = p_user) then 'owner'
    else (select m.role from public.group_members m where m.group_id = p_channel and m.user_id = p_user)
  end;
$$;

-- Predicates used by enforcement (applied separately) + the client.
create or replace function public.is_channel_muted(p_channel uuid, p_user uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.group_members m
    where m.group_id = p_channel and m.user_id = p_user and m.muted_until is not null and m.muted_until > now());
$$;
create or replace function public.is_channel_banned(p_channel uuid, p_user uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.channel_bans b where b.channel_id = p_channel and b.user_id = p_user);
$$;

drop policy if exists "channel_bans_read" on public.channel_bans;
create policy "channel_bans_read" on public.channel_bans for select
  using (public._channel_role(channel_id, auth.uid()) in ('owner','admin') or user_id = auth.uid());

-- Admin member list (gated to owner/admin; empty for anyone else).
create or replace function public.get_channel_members_admin(p_channel uuid)
returns table(user_id uuid, handle text, display_name text, avatar_url text, role text, joined_at timestamptz, muted_until timestamptz)
language sql security definer set search_path = public stable as $$
  select m.user_id, u.handle, u.display_name, u.avatar_url,
         case when g.created_by = m.user_id then 'owner' else coalesce(m.role,'member') end,
         m.joined_at, m.muted_until
  from public.group_members m
  join public.groups g on g.id = m.group_id
  join public.users u on u.id = m.user_id
  where m.group_id = p_channel
    and public._channel_role(p_channel, auth.uid()) in ('owner','admin')
  order by (case when g.created_by = m.user_id then 0 when coalesce(m.role,'member')='admin' then 1 else 2 end), m.joined_at;
$$;

-- Promote/demote — OWNER only.
create or replace function public.promote_member(p_channel uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.groups g where g.id = p_channel and g.created_by = auth.uid()) then
    raise exception 'only the owner can change roles';
  end if;
  if p_role not in ('admin','member') then raise exception 'invalid role'; end if;
  if p_user = auth.uid() then raise exception 'cannot change your own role'; end if;
  update public.group_members set role = p_role where group_id = p_channel and user_id = p_user;
  if not found then raise exception 'not a member'; end if;
end; $$;

-- Shared guard: caller must be owner/admin; can't target self/owner; admins can't target admins.
create or replace function public._assert_can_moderate(p_channel uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare caller text; target text;
begin
  caller := public._channel_role(p_channel, auth.uid());
  if caller not in ('owner','admin') then raise exception 'not authorized'; end if;
  if p_user = auth.uid() then raise exception 'cannot moderate yourself'; end if;
  target := public._channel_role(p_channel, p_user);
  if target = 'owner' then raise exception 'cannot moderate the owner'; end if;
  if caller = 'admin' and target = 'admin' then raise exception 'admins cannot moderate other admins'; end if;
end; $$;

create or replace function public.mute_member(p_channel uuid, p_user uuid, p_hours integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._assert_can_moderate(p_channel, p_user);
  update public.group_members set muted_until = now() + make_interval(hours => greatest(1, p_hours))
    where group_id = p_channel and user_id = p_user;
end; $$;

create or replace function public.unmute_member(p_channel uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._assert_can_moderate(p_channel, p_user);
  update public.group_members set muted_until = null where group_id = p_channel and user_id = p_user;
end; $$;

create or replace function public.kick_member(p_channel uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._assert_can_moderate(p_channel, p_user);
  delete from public.group_members where group_id = p_channel and user_id = p_user;
end; $$;

create or replace function public.ban_member(p_channel uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._assert_can_moderate(p_channel, p_user);
  delete from public.group_members where group_id = p_channel and user_id = p_user;
  insert into public.channel_bans (channel_id, user_id, banned_by) values (p_channel, p_user, auth.uid())
    on conflict (channel_id, user_id) do nothing;
end; $$;

create or replace function public.unban_member(p_channel uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public._channel_role(p_channel, auth.uid()) not in ('owner','admin') then raise exception 'not authorized'; end if;
  delete from public.channel_bans where channel_id = p_channel and user_id = p_user;
end; $$;

grant execute on function
  public.promote_member(uuid,uuid,text),
  public.mute_member(uuid,uuid,integer),
  public.unmute_member(uuid,uuid),
  public.kick_member(uuid,uuid),
  public.ban_member(uuid,uuid),
  public.unban_member(uuid,uuid),
  public.get_channel_members_admin(uuid),
  public.is_channel_muted(uuid,uuid),
  public.is_channel_banned(uuid,uuid)
  to authenticated;
