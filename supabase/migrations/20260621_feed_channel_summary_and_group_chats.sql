-- 2026-06-21 — Feed UI follow-ups (applied live via Supabase Management API).
-- Additive only: two new SECURITY DEFINER functions, no schema/data changes.

-- 1) Feed "Channels" ticker: one call returning the user's channels with unseen updates.
--    Public/members-only channels contribute unreacted youtube posts; group chats (private
--    channels with 3+ members) contribute unread messages. Replaces the client fetches the
--    ChannelsFeedBlock used to do.
create or replace function public.get_channel_updates_summary(p_user_id uuid)
returns table(channel_id uuid, name text, unseen_count bigint)
language sql stable security definer
as $$
  -- Public / members-only channels: unreacted youtube posts.
  select g.id, g.name,
    count(cp.id) filter (
      where cp.poster_id <> p_user_id
        and not exists (select 1 from channel_posts r where r.parent_post_id = cp.id and r.poster_id = p_user_id)
    ) as unseen_count
  from group_members gm
  join groups g on g.id = gm.group_id and g.is_public = true
  left join channel_posts cp on cp.channel_id = g.id and cp.post_type = 'youtube' and cp.parent_post_id is null
  where gm.user_id = p_user_id
  group by g.id, g.name
  having count(cp.id) filter (
      where cp.poster_id <> p_user_id
        and not exists (select 1 from channel_posts r where r.parent_post_id = cp.id and r.poster_id = p_user_id)
    ) > 0

  union all

  -- Group chats (private channels, 3+ members): unread messages since last_read_at.
  select g.id, g.name,
    count(cp.id) filter (
      where cp.created_at > coalesce(gm.last_read_at, '1970-01-01'::timestamptz)
        and cp.poster_id <> p_user_id
        and cp.post_type <> 'status'
    ) as unseen_count
  from group_members gm
  join groups g on g.id = gm.group_id and g.is_public = false and g.is_members_only = false and g.member_count >= 3
  left join channel_posts cp on cp.channel_id = g.id and cp.parent_post_id is null
  where gm.user_id = p_user_id
  group by g.id, g.name, gm.last_read_at
  having count(cp.id) filter (
      where cp.created_at > coalesce(gm.last_read_at, '1970-01-01'::timestamptz)
        and cp.poster_id <> p_user_id
        and cp.post_type <> 'status'
    ) > 0;
$$;
grant execute on function public.get_channel_updates_summary(uuid) to authenticated;

-- 2) Friends-only group chat = a private channel (is_public=false, is_members_only=false)
--    with >=3 members. The name is auto-set by the existing update_private_channel_name
--    trigger from participant handles, so multi-send never makes a group — only this does.
create or replace function public.create_group_chat(p_member_ids uuid[])
returns uuid
language plpgsql security definer
as $$
declare
  ch_id uuid;
  uid uuid := auth.uid();
  m uuid;
  cnt int := 0;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  insert into groups (name, is_public, is_members_only, created_by)
  values ('Group chat', false, false, uid)
  returning id into ch_id;

  insert into group_members (group_id, user_id, role)
  values (ch_id, uid, 'owner') on conflict do nothing;

  foreach m in array p_member_ids loop
    if m is not null and m <> uid then
      if not exists (
        select 1 from friendships f
        where f.status = 'accepted'
          and ((f.user_a = uid and f.user_b = m) or (f.user_a = m and f.user_b = uid))
      ) then
        raise exception 'Can only add friends to a group chat';
      end if;
      insert into group_members (group_id, user_id, role)
      values (ch_id, m, 'member') on conflict do nothing;
      cnt := cnt + 1;
    end if;
  end loop;

  if cnt < 2 then
    raise exception 'A group chat needs at least 2 other members';
  end if;

  return ch_id;
end;
$$;
grant execute on function public.create_group_chat(uuid[]) to authenticated;
