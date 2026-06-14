-- Creator Studio — Phase 0 schema.
-- Admin-granted, exclusive in-app content creation (Bunny Stream hosted).

-- Access flag, distinct from is_creator (the Stripe/monetization role).
alter table public.users
  add column if not exists creator_studio boolean not null default false;

-- The flag must only be settable by an admin (service_role). Users can read their
-- own row, and many setups let them UPDATE it — so guard the column with a trigger
-- that silently reverts any change not made by the service role.
create or replace function public.protect_creator_studio_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Block only end-user-originated changes (PostgREST role authenticated/anon).
  -- Admin paths (direct SQL as postgres, or service_role) are allowed through.
  if new.creator_studio is distinct from old.creator_studio
     and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.creator_studio := old.creator_studio;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_creator_studio on public.users;
create trigger trg_protect_creator_studio
  before update on public.users
  for each row execute function public.protect_creator_studio_flag();

-- Creator videos reuse channel_posts (post_type='creator', source_type='bunny').
-- bunny_video_id = the Bunny Stream video GUID; media_status tracks the encode
-- lifecycle: uploading -> processing -> ready | failed. video_url holds the HLS
-- playlist once ready (reusing the existing column).
alter table public.channel_posts add column if not exists bunny_video_id text;
alter table public.channel_posts add column if not exists media_status text;
-- Per-video visibility for creator posts: 'public' | 'subscribers' (enforced at
-- playback by creator-video-sign).
alter table public.channel_posts add column if not exists visibility text;

-- Webhook looks rows up by GUID.
create index if not exists idx_channel_posts_bunny_video_id
  on public.channel_posts (bunny_video_id)
  where bunny_video_id is not null;
