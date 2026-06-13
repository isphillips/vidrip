-- Now that groups.name is the durable channel title, make the member-name trigger
-- only rename PURE group chats (is_public=false AND is_members_only=false). It
-- previously skipped is_public=true rooms; this also protects any members-only room
-- that happens to be is_public=false.
create or replace function public.update_private_channel_name()
returns trigger language plpgsql security definer as $function$
declare
  gid        uuid := coalesce(new.group_id, old.group_id);
  handles    text[];
  display    text := '';
  h          text;
  candidate  text;
  suffix     text;
  total      int;
  shown      int := 0;
  max_len    constant int := 28;
  i          int;
begin
  -- Only auto-name pure group chats; channels keep their user-set name.
  if not exists (select 1 from groups where id = gid and is_public = false and is_members_only = false) then
    return null;
  end if;

  select array(
    select u.handle from group_members gm join users u on u.id = gm.user_id
    where gm.group_id = gid order by gm.joined_at asc
  ) into handles;

  total := coalesce(array_length(handles, 1), 0);
  if total = 0 then
    update groups set name = 'Empty Channel' where id = gid;
    return null;
  end if;

  for i in 1..total loop
    h         := handles[i];
    candidate := case when display = '' then h else display || ', ' || h end;
    suffix    := case when i < total then ' +' || (total - i)::text else '' end;
    if char_length(candidate || suffix) <= max_len or display = '' then
      display := candidate; shown := i;
    else
      exit;
    end if;
  end loop;

  update groups
  set name = display || case when shown < total then ' +' || (total - shown)::text else '' end
  where id = gid;
  return null;
end;
$function$;
