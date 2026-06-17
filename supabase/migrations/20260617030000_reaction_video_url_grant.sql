-- FIX: friend reactions showing "Not available" for recipients.
--
-- Root cause: saveReaction inserts the row with video_url null, uploads the clip to the
-- `reactions` bucket, then runs `update({ video_url })`. But `authenticated` only had a
-- column-scoped UPDATE grant on (afterthought_url, afterthought_duration) — NOT video_url
-- (see 20260616000000_reaction_afterthought.sql). PostgreSQL checks column privileges BEFORE
-- RLS, so that update was rejected, and the client didn't check the error — so it failed
-- SILENTLY. The file was in storage but the row's video_url stayed null, and recipients (who
-- have no local copy) had nothing to resolve → "Not available". Diagnosed live 2026-06-17:
-- 43/62 reactions had null video_url; the matching .mp4 objects were present in storage.
--
-- Applied live via the Management API 2026-06-17; kept here as a record. Idempotent.

-- Allow the reactor to write their own reaction's video_url. The existing UPDATE policy
-- "reactions: update own afterthought" already restricts row updates to auth.uid() = user_id,
-- so this grants no more reach than the afterthought columns already had.
grant update (video_url) on public.reactions to authenticated;

-- Backfill: relink the orphaned rows whose clip is still in storage (new naming scheme is
-- <userId>/<threadId>/<reactionId>.mp4). Older rows (>14d) whose relay copy was already
-- removed by the cleanup-reactions TTL job have no object and are left null — expected.
update public.reactions r
set video_url = 'https://ltpscwticavqutbzrrjb.supabase.co/storage/v1/object/public/reactions/' || o.name
from storage.objects o
where o.bucket_id = 'reactions'
  and o.name like '%/' || r.id::text || '.mp4'
  and r.video_url is null;
