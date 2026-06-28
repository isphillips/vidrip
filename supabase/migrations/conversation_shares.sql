-- conversation_shares(p_friend): every video share between the caller (auth.uid()) and p_friend,
-- in BOTH directions, with the recipient's reaction state + time.
--
-- Why an RPC: `threads` RLS only exposes threads you're a MEMBER of, and the sender is NOT a member
-- of their own thread — so a direct client read can never see your OUTBOUND shares (videos you sent).
-- This SECURITY DEFINER function bypasses that, but is safe: the WHERE clause only ever returns
-- threads where the CALLER is a participant (sender or member), so a user can't read arbitrary pairs.
-- It also reads the friend's reaction row on threads YOU sent, so the conversation can show "they
-- reacted" and sort the share to the bottom by reaction time.
create or replace function public.conversation_shares(p_friend uuid)
returns table (
  id uuid,
  direction text,
  video_id text,
  video_title text,
  video_thumbnail text,
  source_type text,
  thread_kind text,
  sent_at timestamptz,
  reacted boolean,
  reacted_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    t.id,
    case when t.sender_id = auth.uid() then 'mine' else 'theirs' end as direction,
    t.video_id, t.video_title, t.video_thumbnail, t.source_type, t.thread_kind,
    t.created_at as sent_at,
    exists (
      select 1 from reactions r
      where r.thread_id = t.id
        and r.user_id = case when t.sender_id = auth.uid() then p_friend else auth.uid() end
    ) as reacted,
    (
      select max(r.created_at) from reactions r
      where r.thread_id = t.id
        and r.user_id = case when t.sender_id = auth.uid() then p_friend else auth.uid() end
    ) as reacted_at
  from threads t
  where
    (t.sender_id = auth.uid()
       and exists (select 1 from thread_members m where m.thread_id = t.id and m.user_id = p_friend))
    or
    (t.sender_id = p_friend
       and exists (select 1 from thread_members m where m.thread_id = t.id and m.user_id = auth.uid()))
  order by t.created_at asc;
$$;

grant execute on function public.conversation_shares(uuid) to authenticated;
