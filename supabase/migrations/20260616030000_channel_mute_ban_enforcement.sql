-- Server-side enforcement for channel mute/ban: a muted member can't post; a banned user
-- can't (re)join. Done with ALTER POLICY (not drop/recreate) so the exact existing logic +
-- role are preserved and there's no window where posting is unprotected. The appended guards
-- are no-ops for non-muted/non-banned users (the predicates return false → NOT false = true).
-- Applied live 2026-06-16; recorded here.

alter policy cp_insert on public.channel_posts with check (
  (poster_id = auth.uid())
  and (
    is_channel_member(channel_id, auth.uid())
    or (is_public_channel(channel_id) and (exists (
      select 1 from public.groups where groups.id = channel_posts.channel_id and groups.created_by = auth.uid()
    )))
  )
  and not public.is_channel_muted(channel_id, auth.uid())
  and not public.is_channel_banned(channel_id, auth.uid())
);

alter policy gm_insert on public.group_members with check (
  (user_id = auth.uid())
  and (
    is_public_channel(group_id)
    or (is_members_only_channel(group_id) and (not coalesce((
      select g.invite_only from public.groups g where g.id = group_members.group_id
    ), false)))
  )
  and not public.is_channel_banned(group_id, auth.uid())
);
