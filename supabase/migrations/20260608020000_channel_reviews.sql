-- Reviews — "Side B" to Reactions. After a member reacts to a channel post they
-- may submit a 60s review clip that goes directly to the creator. The creator can
-- toggle whether reviews are visible to the whole channel.
--
-- Reviews live in their OWN table (not channel_posts) on purpose: channel_posts'
-- cp_select policy is permissive (any member/public viewer sees every post), and
-- RLS policies only ever GRANT access — so reviews stored there could never be
-- gated to "creator-only when the toggle is off". A dedicated table with its own
-- restrictive policies is the only way to honor the visibility toggle.

-- Per-channel visibility toggle (owner-controlled). Off = creator-only inbox.
alter table public.groups add column if not exists reviews_enabled boolean not null default false;

-- The groups_update RLS policy (created_by = auth.uid()) already intends owners to
-- update their channel, but the authenticated role was never granted UPDATE on the
-- table — table grants are checked BEFORE row policies, so owner updates (incl. the
-- reviews_enabled toggle) silently failed. Grant the missing half.
grant update on public.groups to authenticated;

create table if not exists public.channel_reviews (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.groups(id) on delete cascade,
  post_id uuid not null references public.channel_posts(id) on delete cascade,  -- source video reviewed
  reviewer_id uuid not null references public.users(id) on delete cascade,
  video_url text,                         -- public URL in the 'reviews' bucket
  storage_mode text not null default 'cloud',
  duration int,
  created_at timestamptz not null default now(),
  unique (post_id, reviewer_id)           -- one review per person per post
);

create index if not exists idx_channel_reviews_channel on public.channel_reviews (channel_id, created_at desc);
create index if not exists idx_channel_reviews_post on public.channel_reviews (post_id, created_at desc);

alter table public.channel_reviews enable row level security;

-- SELECT: the channel owner always sees every review (their inbox); the reviewer
-- always sees their own; everyone else sees them only when the owner has flipped
-- reviews_enabled on AND they can see the channel.
do $$ begin
  create policy cr_select on public.channel_reviews for select using (
    reviewer_id = auth.uid()
    or exists (select 1 from public.groups g
               where g.id = channel_id and g.created_by = auth.uid())
    or (
      coalesce((select g.reviews_enabled from public.groups g where g.id = channel_id), false)
      and (
        public.is_public_channel(channel_id)
        or public.is_members_only_channel(channel_id)
        or public.is_channel_member(channel_id, auth.uid())
      )
    )
  );
exception when duplicate_object then null; end $$;

-- INSERT: you may submit a review only for yourself, on a post in a channel you
-- belong to, and only after you've already reacted to that post.
do $$ begin
  create policy cr_insert on public.channel_reviews for insert with check (
    reviewer_id = auth.uid()
    and exists (select 1 from public.channel_posts cp
                where cp.id = post_id and cp.channel_id = channel_id)
    and public.is_channel_member(channel_id, auth.uid())
    and exists (select 1 from public.channel_posts r
                where r.parent_post_id = post_id and r.poster_id = auth.uid())
  );
exception when duplicate_object then null; end $$;

-- UPDATE: reviewer patches their own row (sets video_url after upload).
do $$ begin
  create policy cr_update on public.channel_reviews for update using (reviewer_id = auth.uid());
exception when duplicate_object then null; end $$;

-- DELETE: reviewer removes their own; owner can remove any from their channel.
do $$ begin
  create policy cr_delete on public.channel_reviews for delete using (
    reviewer_id = auth.uid()
    or exists (select 1 from public.groups g
               where g.id = channel_id and g.created_by = auth.uid())
  );
exception when duplicate_object then null; end $$;

-- Table-level grants are checked BEFORE row policies; without these the
-- authenticated role gets empty reads / silent failures.
grant select, insert, update, delete on public.channel_reviews to authenticated;
grant all on public.channel_reviews to service_role;

-- Review clips bucket. Public-read like the reactions bucket: the clip URL is only
-- ever exposed through an RLS-gated channel_reviews row read, so row RLS is the
-- real gate. Capped to 60s clips (~60MB ceiling).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reviews', 'reviews', true, 62914560, array['video/mp4', 'video/quicktime'])
on conflict (id) do update
  set public = true,
      file_size_limit = 62914560,
      allowed_mime_types = array['video/mp4', 'video/quicktime'];

-- Anyone authenticated can read; a user may write only under their own folder.
-- Path mirrors the reactions bucket: reviews/<reviewerId>/<postId>/<reviewId>.mp4
do $$ begin
  create policy reviews_read on storage.objects
    for select using (bucket_id = 'reviews');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy reviews_insert_own on storage.objects
    for insert with check (bucket_id = 'reviews' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy reviews_delete_own on storage.objects
    for delete using (bucket_id = 'reviews' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;
