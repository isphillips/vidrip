-- Afterthought ("outro") clip attached to a reaction: an optional short selfie the
-- reactor records right after the main reaction, which plays as a post-roll for the
-- viewer. Applied live via the Management API on 2026-06-16; kept here as a record.
-- Idempotent (IF NOT EXISTS / DROP IF EXISTS) so it's safe to re-run.

alter table public.reactions
  add column if not exists afterthought_url text,
  add column if not exists afterthought_duration integer;

-- Column-scoped UPDATE grant — the reactor can set only their own afterthought, nothing
-- else (e.g. video_url) becomes writable. (Per project history: an RLS policy alone isn't
-- enough; authenticated also needs the column GRANT, which is checked before RLS.)
grant update (afterthought_url, afterthought_duration) on public.reactions to authenticated;

drop policy if exists "reactions: update own afterthought" on public.reactions;
create policy "reactions: update own afterthought"
  on public.reactions for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
