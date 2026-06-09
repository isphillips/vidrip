-- Notify the channel owner when an invitee accepts or declines their invite.

create or replace function public.accept_channel_invite(p_channel_id uuid)
returns void language plpgsql security definer as $$
declare v_owner uuid; v_name text; v_invitee text;
begin
  if not exists (
    select 1 from public.channel_invites ci
    where ci.channel_id = p_channel_id and ci.invitee_id = auth.uid() and ci.status = 'pending'
  ) then
    raise exception 'No pending invite';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (p_channel_id, auth.uid(), 'member')
  on conflict do nothing;
  update public.channel_invites set status = 'accepted'
  where channel_id = p_channel_id and invitee_id = auth.uid();

  select g.created_by, coalesce(g.display_name, g.name) into v_owner, v_name
  from public.groups g where g.id = p_channel_id;
  select handle into v_invitee from public.users where id = auth.uid();
  if v_owner is not null and v_owner <> auth.uid() then
    perform public.send_push_to_user(
      v_owner,
      '@' || coalesce(v_invitee, 'Someone') || ' joined',
      'Accepted your invite to ' || coalesce(v_name, 'your channel')
    );
  end if;
end $$;

create or replace function public.decline_channel_invite(p_channel_id uuid)
returns void language plpgsql security definer as $$
declare v_owner uuid; v_name text; v_invitee text;
begin
  update public.channel_invites set status = 'declined'
  where channel_id = p_channel_id and invitee_id = auth.uid() and status = 'pending';
  if not found then return; end if;  -- no pending invite → nothing to notify

  select g.created_by, coalesce(g.display_name, g.name) into v_owner, v_name
  from public.groups g where g.id = p_channel_id;
  select handle into v_invitee from public.users where id = auth.uid();
  if v_owner is not null and v_owner <> auth.uid() then
    perform public.send_push_to_user(
      v_owner,
      '@' || coalesce(v_invitee, 'Someone') || ' declined',
      'Declined your invite to ' || coalesce(v_name, 'your channel')
    );
  end if;
end $$;
