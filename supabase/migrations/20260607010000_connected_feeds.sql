-- "For You" connected feeds + creator/feed connection split.

-- Creator flag: gates the creator-only "Connected Accounts" section in-app.
alter table public.users add column if not exists is_creator boolean not null default false;

-- A synced account is either a CREATOR connection (opens a Members Only channel)
-- or a FEED connection (pulls the user's personal feed into the "For You" grid).
-- A user may have one of each per provider, so the unique key includes the type.
alter table public.synced_accounts add column if not exists connection_type text not null default 'creator';
do $$ begin
  alter table public.synced_accounts
    add constraint synced_accounts_connection_type_check check (connection_type in ('creator', 'feed'));
exception when duplicate_object then null; end $$;
alter table public.synced_accounts drop constraint if exists synced_accounts_user_id_provider_key;
create unique index if not exists synced_accounts_user_provider_type_key
  on public.synced_accounts (user_id, provider, connection_type);

-- Cached feed items pulled from a user's FEED connection (e.g. YouTube Liked
-- Videos). Written by the refresh-feed edge function (service role); each user
-- reads only their own. Refresh cadence is rate-limited in the edge function
-- using synced_accounts.last_synced_at on the feed row.
create table if not exists public.connected_feed_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  video_id text not null,
  title text,
  thumbnail text,
  channel_title text,
  source_type text not null default 'youtube',
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique (user_id, provider, video_id)
);

alter table public.connected_feed_items enable row level security;
do $$ begin
  create policy cfi_select_own on public.connected_feed_items
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

grant select on public.connected_feed_items to authenticated;
grant all on public.connected_feed_items to service_role;

create index if not exists idx_cfi_user_fetched
  on public.connected_feed_items (user_id, fetched_at desc);
