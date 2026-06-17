-- Exclusive content & collections.
-- A creator groups videos into collections; a video may belong to many collections. Designating a
-- video exclusive (is_exclusive) removes it from the regular channel feed. Collections are AWARDED
-- to users — by subscription tier (granted on activation) or to individuals (granted immediately).
-- Awards are immutable: access derives from the award row, so it can never be revoked.

-- A video becomes exclusive (hidden from the regular feed) when added to any collection. Sticky by
-- default, but the creator can flip it back (decision: sticky-but-configurable).
alter table channel_posts add column if not exists is_exclusive boolean not null default false;

create table if not exists exclusive_collections (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid not null references groups(id) on delete cascade,
  creator_id      uuid not null references users(id) on delete cascade,
  name            text not null,
  cover_url       text,          -- image cover
  cover_video_url text,          -- optional video cover
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists exclusive_collections_channel_idx on exclusive_collections (channel_id);

-- Which videos are in a collection (M:N — a video can be in several collections).
create table if not exists collection_videos (
  collection_id uuid not null references exclusive_collections(id) on delete cascade,
  post_id       uuid not null references channel_posts(id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (collection_id, post_id)
);
create index if not exists collection_videos_post_idx on collection_videos (post_id);

-- Which subscription tiers grant a collection (awarded on subscription activation).
create table if not exists collection_tier_grants (
  collection_id uuid not null references exclusive_collections(id) on delete cascade,
  tier_id       uuid not null references channel_subscription_tiers(id) on delete cascade,
  primary key (collection_id, tier_id)
);
create index if not exists collection_tier_grants_tier_idx on collection_tier_grants (tier_id);

-- The grant to a user. Immutable: never updated (except seen_at) or deleted → access can't be revoked.
create table if not exists collection_awards (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references exclusive_collections(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  awarded_by    uuid references users(id),
  source        text not null check (source in ('tier', 'individual')),
  awarded_at    timestamptz not null default now(),
  seen_at       timestamptz,                       -- null = unopened gift (shows in inbox)
  unique (collection_id, user_id)                  -- idempotent: a user is awarded a collection once
);
create index if not exists collection_awards_user_idx on collection_awards (user_id);

-- ── Access primitive ─────────────────────────────────────────────────────────
-- True if `uid` has been awarded any collection that contains `post`. Used by RLS on the private
-- reaction/review threads and by the playback-sign function.
create or replace function has_exclusive_access(post uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from collection_videos cv
    join collection_awards ca on ca.collection_id = cv.collection_id
    where cv.post_id = post and ca.user_id = uid
  );
$$;

-- Recipient marks their gift opened (only seen_at, only their own award).
create or replace function mark_award_seen(award uuid)
returns void language sql security definer set search_path = public as $$
  update collection_awards set seen_at = now()
  where id = award and user_id = auth.uid() and seen_at is null;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table exclusive_collections   enable row level security;
alter table collection_videos       enable row level security;
alter table collection_tier_grants  enable row level security;
alter table collection_awards       enable row level security;

-- Collections: the creator manages; an awarded user can read the ones they hold.
create policy collections_owner on exclusive_collections for all
  using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy collections_awarded_read on exclusive_collections for select
  using (id in (select collection_id from collection_awards where user_id = auth.uid()));

-- Collection ↔ video: creator manages; awarded users can read the membership of their collections.
create policy collection_videos_owner on collection_videos for all
  using (exists (select 1 from exclusive_collections c where c.id = collection_id and c.creator_id = auth.uid()))
  with check (exists (select 1 from exclusive_collections c where c.id = collection_id and c.creator_id = auth.uid()));
create policy collection_videos_awarded_read on collection_videos for select
  using (collection_id in (select collection_id from collection_awards where user_id = auth.uid()));

-- Tier grants: creator manages; readable by authenticated (so the subscribe UI can list perks).
create policy tier_grants_owner on collection_tier_grants for all
  using (exists (select 1 from exclusive_collections c where c.id = collection_id and c.creator_id = auth.uid()))
  with check (exists (select 1 from exclusive_collections c where c.id = collection_id and c.creator_id = auth.uid()));
create policy tier_grants_read on collection_tier_grants for select using (auth.role() = 'authenticated');

-- Awards: a user sees their own; a creator sees who they've awarded. Inserts are service-role only
-- (the award-collection edge function) — no client insert/update/delete (immutable). seen_at is
-- updated via mark_award_seen().
create policy awards_recipient_read on collection_awards for select using (user_id = auth.uid());
create policy awards_creator_read on collection_awards for select
  using (exists (select 1 from exclusive_collections c where c.id = collection_id and c.creator_id = auth.uid()));
