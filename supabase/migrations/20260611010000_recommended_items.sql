-- Per-user cache for the "Recommended" share-grid tab: short-form videos pulled
-- from the user's most-relevant subscribed channels (recent uploads). Written by
-- the fetch-recommended edge function (service role); the user reads their own.
create table if not exists public.recommended_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  title text,
  thumbnail text,
  channel_title text,
  channel_id text,
  source_type text not null default 'youtube',
  duration integer,                       -- seconds (already filtered to <= 180)
  published_at timestamptz,
  fetched_at timestamptz not null default now()
);

create index if not exists recommended_items_user_idx
  on public.recommended_items (user_id, fetched_at desc);

alter table public.recommended_items enable row level security;

-- Hand-run migrations skip the authenticated-role grants — set them explicitly.
grant select on public.recommended_items to authenticated;
grant all on public.recommended_items to service_role;

drop policy if exists recommended_items_select_own on public.recommended_items;
create policy recommended_items_select_own on public.recommended_items
  for select to authenticated using (user_id = auth.uid());
