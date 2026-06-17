-- Fix: infinite recursion (42P17) in exclusive-content RLS.
-- exclusive_collections."awarded read" referenced collection_awards, and collection_awards."creator
-- read" referenced exclusive_collections → mutual RLS recursion. Route every cross-table check
-- through SECURITY DEFINER helpers (which run as the function owner and bypass RLS internally), so a
-- policy on one table no longer triggers the other table's policies.

create or replace function owns_collection(collection uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from exclusive_collections c where c.id = collection and c.creator_id = uid);
$$;

create or replace function is_awarded(collection uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from collection_awards a where a.collection_id = collection and a.user_id = uid);
$$;

-- exclusive_collections: awarded users can read theirs (no longer queries collection_awards with RLS).
drop policy if exists collections_awarded_read on exclusive_collections;
create policy collections_awarded_read on exclusive_collections for select
  using (is_awarded(id, auth.uid()));

-- collection_videos: creator manages; awarded users read membership.
drop policy if exists collection_videos_owner on collection_videos;
create policy collection_videos_owner on collection_videos for all
  using (owns_collection(collection_id, auth.uid()))
  with check (owns_collection(collection_id, auth.uid()));
drop policy if exists collection_videos_awarded_read on collection_videos;
create policy collection_videos_awarded_read on collection_videos for select
  using (is_awarded(collection_id, auth.uid()));

-- collection_tier_grants: creator manages.
drop policy if exists tier_grants_owner on collection_tier_grants;
create policy tier_grants_owner on collection_tier_grants for all
  using (owns_collection(collection_id, auth.uid()))
  with check (owns_collection(collection_id, auth.uid()));

-- collection_awards: creator sees who they've awarded (no longer queries exclusive_collections with RLS).
drop policy if exists awards_creator_read on collection_awards;
create policy awards_creator_read on collection_awards for select
  using (owns_collection(collection_id, auth.uid()));
