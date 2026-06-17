-- Channel advertisement/description video: an owner/admin-set clip shown on the channel
-- (the subscribe pitch for non-subscribers). Applied live via the Management API 2026-06-16;
-- kept here as a record. Idempotent.

alter table public.groups
  add column if not exists ad_video_url text,
  add column if not exists ad_video_duration integer;

-- Set via a SECURITY DEFINER RPC (not a broadened groups UPDATE policy) so an admin can set
-- ONLY the ad video, not every channel setting. Owner (created_by) or an owner/admin
-- group_members row may set it.
create or replace function public.set_channel_ad_video(p_channel uuid, p_url text, p_duration integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.groups g where g.id = p_channel and (
      g.created_by = auth.uid()
      or exists (
        select 1 from public.group_members m
        where m.group_id = p_channel and m.user_id = auth.uid() and m.role in ('owner','admin')
      )
    )
  ) then
    raise exception 'not authorized to set channel ad video';
  end if;
  update public.groups set ad_video_url = p_url, ad_video_duration = p_duration where id = p_channel;
end; $$;

grant execute on function public.set_channel_ad_video(uuid, text, integer) to authenticated;
