-- "Show reactions in profile": an opt-in flag that surfaces a user's recent
-- reactions (normally private to a thread's members) on their public profile.
-- Default off — the toggle is the user's explicit consent to make them viewable.

alter table public.users
  add column if not exists show_reactions_in_profile boolean not null default false;

-- The owner may flip their own flag from the app (RLS already scopes updates to
-- the signed-in user's own row); grant the single column to authenticated.
grant update (show_reactions_in_profile) on public.users to authenticated;

-- Recent reactions for a profile, gated by the owner's opt-in. SECURITY DEFINER so
-- it can bypass per-thread membership RLS — but ONLY returns rows when the owner
-- has show_reactions_in_profile = true, and only cloud-available reactions (others
-- can actually watch them). All reactions are on public external content
-- (YouTube/TikTok/Instagram), so nothing exclusive/private leaks here.
create or replace function public.get_profile_reactions(target uuid, lim int default 9)
returns table (
  id uuid,
  yt_video_id text,
  source_type text,
  duration int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.yt_video_id, r.source_type, r.duration::int, r.created_at
  from public.reactions r
  join public.users u on u.id = r.user_id
  where r.user_id = target
    and u.show_reactions_in_profile = true
    and r.video_url is not null
    and coalesce(r.storage_mode, 'cloud') <> 'deleted'
  order by r.created_at desc
  limit greatest(1, least(coalesce(lim, 9), 30));
$$;

grant execute on function public.get_profile_reactions(uuid, int) to authenticated, anon;
