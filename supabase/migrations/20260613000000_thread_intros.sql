-- Share intros: an optional personal video clip the sender records to introduce
-- the video they're sharing. Stored in the existing (private) `reactions` bucket
-- under `intros/{threadId}/…` and surfaced as a pre-roll before the recipient
-- reacts and before anyone watches a reaction in the thread.

-- 1. Carry the intro on the share itself (one intro per thread).
alter table public.threads
  add column if not exists intro_url text,
  add column if not exists intro_duration integer;

-- 2. `threads` had SELECT (sender + members) and INSERT (sender) policies but no
--    UPDATE policy, so attaching the intro after upload would be denied by RLS.
--    Let a sender update their own thread.
drop policy if exists "threads_update_own" on public.threads;
create policy "threads_update_own" on public.threads
  for update to authenticated
  using  (sender_id = auth.uid())
  with check (sender_id = auth.uid());
