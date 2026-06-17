-- Let awarded users read the exclusive posts they hold (and their private reaction/review threads).
-- has_exclusive_access(post, uid) is defined in 20260617000000_exclusive_collections.sql.

-- The exclusive source video rows: visible to anyone who's been awarded a collection containing them
-- (additive to existing channel_posts select policies; non-exclusive posts are unaffected).
create policy channel_posts_exclusive_awarded_read on channel_posts for select
  using (is_exclusive and has_exclusive_access(id, auth.uid()));

-- Shared-private thread: reactions/audio (channel_posts with parent_post_id) on an exclusive post are
-- visible to everyone who holds access to that parent — a private community thread, not the public
-- channel. Awarded users (and the creator, via the existing owner policies) can also post into it.
create policy channel_posts_exclusive_thread_read on channel_posts for select
  using (parent_post_id is not null and has_exclusive_access(parent_post_id, auth.uid()));
create policy channel_posts_exclusive_thread_write on channel_posts for insert
  with check (parent_post_id is not null and has_exclusive_access(parent_post_id, auth.uid()) and poster_id = auth.uid());

-- Reviews on an exclusive post: same shared-private audience.
create policy channel_reviews_exclusive_read on channel_reviews for select
  using (has_exclusive_access(post_id, auth.uid()));
create policy channel_reviews_exclusive_write on channel_reviews for insert
  with check (has_exclusive_access(post_id, auth.uid()) and reviewer_id = auth.uid());
