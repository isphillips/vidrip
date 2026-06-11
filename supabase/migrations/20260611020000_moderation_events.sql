-- Audit log for automated content moderation. The moderate-frames edge function
-- (service role) samples frames from a freshly recorded clip, scores them with
-- OpenAI's moderation model, and writes one row per check here — both passes and
-- blocks — so rejections can be reviewed/audited later.
create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  content_type text,                                  -- reaction | channel_clip | channel_video | review
  allowed boolean not null,                           -- false = upload was rejected
  tripped_categories text[] not null default '{}',    -- categories that crossed threshold
  scores jsonb not null default '{}'::jsonb,          -- max category_scores across sampled frames
  frame_count integer,
  created_at timestamptz not null default now()
);

create index if not exists moderation_events_user_idx
  on public.moderation_events (user_id, created_at desc);
-- Fast lookup of rejections for review.
create index if not exists moderation_events_blocked_idx
  on public.moderation_events (created_at desc) where allowed = false;

alter table public.moderation_events enable row level security;

-- Hand-run migrations skip the authenticated-role grants — set them explicitly.
grant select on public.moderation_events to authenticated;
grant all on public.moderation_events to service_role;

-- Users may see their own moderation history; inserts come from the edge function
-- (service role), which bypasses RLS.
drop policy if exists moderation_events_select_own on public.moderation_events;
create policy moderation_events_select_own on public.moderation_events
  for select to authenticated using (user_id = auth.uid());
