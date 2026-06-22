-- Content & user reports for UGC safety (App Store / Play UGC policy requirement).
-- Reporters file reports from the app; staff review them out-of-band (dashboard / queue).
-- Mirrors the user_blocks pattern: idempotent inserts, RLS scoped to the reporter.

create table if not exists public.content_reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references auth.users (id) on delete cascade,
  -- what was reported
  target_type      text not null check (target_type in
                     ('user','reaction','comment','post','clip','channel','thread')),
  target_id        text not null,
  -- the user who authored/owns the reported content (null when reporting a channel, etc.)
  reported_user_id uuid references auth.users (id) on delete set null,
  reason           text,
  details          text,
  created_at       timestamptz not null default now(),
  -- one report per reporter per target (re-reporting is a no-op, like user_blocks)
  unique (reporter_id, target_type, target_id)
);

alter table public.content_reports enable row level security;

-- A signed-in user may file a report as themselves...
create policy "content_reports_insert_own"
  on public.content_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

-- ...and read back only their own reports (review/moderation happens via service role).
create policy "content_reports_select_own"
  on public.content_reports for select
  to authenticated
  using (auth.uid() = reporter_id);

create index if not exists content_reports_target_idx
  on public.content_reports (target_type, target_id);
create index if not exists content_reports_reported_user_idx
  on public.content_reports (reported_user_id);
