-- Share intros: an optional personal video clip the sender records to introduce
-- the video they're sharing. Stored in the existing (private) `reactions` bucket
-- under `intros/{threadId}/…` and surfaced as a pre-roll before the recipient
-- reacts and before anyone watches a reaction in the thread.

-- 1. Carry the intro on the share itself (one intro per thread).
alter table public.threads
  add column if not exists intro_url text,
  add column if not exists intro_duration integer;

-- 2. `threads` had SELECT (sender + members) and INSERT (sender) policies but no
--    UPDATE path at all, so attaching the intro after upload was denied. Two pieces
--    are required: a table-level GRANT (checked before RLS) and an RLS policy.
--    The GRANT is column-scoped so a sender can ONLY touch the intro fields.
grant update (intro_url, intro_duration) on public.threads to authenticated;

drop policy if exists "threads_update_own" on public.threads;
create policy "threads_update_own" on public.threads
  for update to authenticated
  using  (sender_id = auth.uid())
  with check (sender_id = auth.uid());
