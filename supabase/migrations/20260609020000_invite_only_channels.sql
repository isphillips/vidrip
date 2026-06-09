-- Invite Only Members channels: publicly visible but locked until the owner
-- invites a user, who must accept. Invites notify via push.

alter table public.groups add column if not exists invite_only boolean not null default false;

-- Pending/accepted/declined invites, one per (channel, invitee).
create table if not exists public.channel_invites (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.groups(id) on delete cascade,
  invitee_id uuid not null references public.users(id) on delete cascade,
  inviter_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (channel_id, invitee_id)
);
create index if not exists idx_channel_invites_invitee on public.channel_invites (invitee_id, status);
create index if not exists idx_channel_invites_channel on public.channel_invites (channel_id);

alter table public.channel_invites enable row level security;

-- The invitee sees their own invites; the channel owner sees invites they sent.
do $$ begin
  create policy ci_select on public.channel_invites for select using (
    invitee_id = auth.uid()
    or exists (select 1 from public.groups g where g.id = channel_id and g.created_by = auth.uid())
  );
exception when duplicate_object then null; end $$;

-- Writes go through the SECURITY DEFINER RPCs below.
grant select on public.channel_invites to authenticated;
grant all on public.channel_invites to service_role;

-- Owner invites a user → pending invite + push notification.
create or replace function public.invite_to_channel(p_channel_id uuid, p_user_id uuid)
returns void language plpgsql security definer as $$
declare v_name text; v_inviter text;
begin
  if not exists (select 1 from public.groups g where g.id = p_channel_id and g.created_by = auth.uid()) then
    raise exception 'Only the channel owner can invite';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Cannot invite yourself';
  end if;

  insert into public.channel_invites (channel_id, invitee_id, inviter_id, status)
  values (p_channel_id, p_user_id, auth.uid(), 'pending')
  on conflict (channel_id, invitee_id)
    do update set status = 'pending', inviter_id = auth.uid(), created_at = now();

  select coalesce(g.display_name, g.name) into v_name from public.groups g where g.id = p_channel_id;
  select handle into v_inviter from public.users where id = auth.uid();
  perform public.send_push_to_user(
    p_user_id,
    '@' || coalesce(v_inviter, 'Someone') || ' invited you',
    'Tap to join ' || coalesce(v_name, 'a channel') || ' on Vidrip'
  );
end $$;

-- Invitee accepts → becomes a member (bypasses the self-join block below).
create or replace function public.accept_channel_invite(p_channel_id uuid)
returns void language plpgsql security definer as $$
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
end $$;

create or replace function public.decline_channel_invite(p_channel_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.channel_invites set status = 'declined'
  where channel_id = p_channel_id and invitee_id = auth.uid() and status = 'pending';
end $$;

grant execute on function public.invite_to_channel(uuid, uuid) to authenticated;
grant execute on function public.accept_channel_invite(uuid) to authenticated;
grant execute on function public.decline_channel_invite(uuid) to authenticated;

-- Block self-join into invite-only channels — membership comes only via accept.
drop policy if exists gm_insert on public.group_members;
create policy gm_insert on public.group_members for insert with check (
  (user_id = auth.uid()) and (
    public.is_public_channel(group_id)
    or (
      public.is_members_only_channel(group_id)
      and not coalesce((select g.invite_only from public.groups g where g.id = group_id), false)
    )
  )
);
