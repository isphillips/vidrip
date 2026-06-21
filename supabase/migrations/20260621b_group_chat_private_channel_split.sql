-- 2026-06-21 — Split group chats from private (creator) channels. Applied via Management API.
-- Group chats: created by anyone, optional name, ANY member renames, shown in the Feed.
-- Private channels: creator-only, required name, owner renames, shown in Channels (unchanged
-- creator-channel behaviour). Additive columns + a data backfill of the new flag only.

alter table groups add column if not exists is_group_chat boolean not null default false;
alter table groups add column if not exists name_custom boolean not null default false;

-- NOTE: no backfill. Only channels created through create_group_chat() are group chats
-- (Feed). Pre-existing multi-member private channels are NOT group chats and stay
-- is_group_chat=false (an earlier backfill that flagged them was reverted).

-- Shared auto-namer (participants' handles, max 28 chars).
create or replace function public.refresh_group_name(gid uuid)
returns void language plpgsql security definer as $$
declare
  handles text[]; display text := ''; candidate text; suffix text;
  total int; shown int := 0; max_len constant int := 28; i int;
begin
  select array(
    select u.handle from group_members gm join users u on u.id = gm.user_id
    where gm.group_id = gid order by gm.joined_at asc
  ) into handles;
  total := coalesce(array_length(handles, 1), 0);
  if total = 0 then update groups set name = 'Empty Chat' where id = gid; return; end if;
  for i in 1..total loop
    candidate := case when display = '' then handles[i] else display || ', ' || handles[i] end;
    suffix    := case when i < total then ' +' || (total - i)::text else '' end;
    if char_length(candidate || suffix) <= max_len or display = '' then
      display := candidate; shown := i;
    else exit; end if;
  end loop;
  update groups set name = display || case when shown < total then ' +' || (total - shown)::text else '' end
  where id = gid;
end; $$;

-- Auto-name private chats only when they have no custom name (custom names persist).
create or replace function public.update_private_channel_name()
returns trigger language plpgsql security definer as $$
declare gid uuid := coalesce(new.group_id, old.group_id);
begin
  if not exists (
    select 1 from groups
    where id = gid and is_public = false and is_members_only = false and coalesce(name_custom, false) = false
  ) then
    return null;
  end if;
  perform public.refresh_group_name(gid);
  return null;
end; $$;

-- Anyone creates a group chat (is_group_chat = true); friends-only members.
create or replace function public.create_group_chat(p_member_ids uuid[])
returns uuid language plpgsql security definer as $$
declare ch_id uuid; uid uuid := auth.uid(); m uuid; cnt int := 0;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  insert into groups (name, is_public, is_members_only, is_group_chat, created_by)
  values ('Group chat', false, false, true, uid) returning id into ch_id;
  insert into group_members (group_id, user_id, role) values (ch_id, uid, 'owner') on conflict do nothing;
  foreach m in array p_member_ids loop
    if m is not null and m <> uid then
      if not exists (
        select 1 from friendships f where f.status = 'accepted'
          and ((f.user_a = uid and f.user_b = m) or (f.user_a = m and f.user_b = uid))
      ) then raise exception 'Can only add friends to a group chat'; end if;
      insert into group_members (group_id, user_id, role) values (ch_id, m, 'member') on conflict do nothing;
      cnt := cnt + 1;
    end if;
  end loop;
  if cnt < 2 then raise exception 'A group chat needs at least 2 other members'; end if;
  return ch_id;
end; $$;
grant execute on function public.create_group_chat(uuid[]) to authenticated;

-- Any member renames a group chat; empty name reverts to the auto participant name.
create or replace function public.rename_group_chat(p_channel_id uuid, p_name text)
returns void language plpgsql security definer as $$
declare uid uuid := auth.uid(); trimmed text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from group_members where group_id = p_channel_id and user_id = uid) then
    raise exception 'Not a member of this group chat';
  end if;
  if not exists (select 1 from groups where id = p_channel_id and is_group_chat = true) then
    raise exception 'Not a group chat';
  end if;
  if trimmed is null then
    update groups set name_custom = false where id = p_channel_id;
    perform public.refresh_group_name(p_channel_id);
  else
    update groups set name = trimmed, name_custom = true where id = p_channel_id;
  end if;
end; $$;
grant execute on function public.rename_group_chat(uuid, text) to authenticated;
