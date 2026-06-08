-- Reaction relay TTL: cloud copies are ephemeral; everyone involved keeps a local
-- copy (recorder records locally + uploads relay; recipients auto-download & cache).
-- This job removes the cloud relay once all recipients have downloaded, or after a
-- backstop TTL. Actual storage deletion happens in the cleanup-reactions edge fn.

-- Returns relays safe to remove.
create or replace function public.reactions_to_expire(ttl_days int default 14)
returns table(id uuid, video_url text) language sql security definer as $$
  select r.id, r.video_url
  from public.reactions r
  where r.video_url is not null
    and r.storage_mode = 'local'
    and (
      r.created_at < now() - (ttl_days || ' days')::interval
      or not exists (
        select 1 from public.thread_members tm
        where tm.thread_id = r.thread_id
          and tm.user_id <> r.user_id
          and not exists (
            select 1 from public.reaction_downloads rd
            where rd.reaction_id = r.id and rd.user_id = tm.user_id
          )
      )
    );
$$;

-- Hourly cron → cleanup-reactions edge function (authenticated via x-cleanup-secret,
-- which matches the CLEANUP_SECRET function secret). Requires pg_cron + pg_net.
-- NOTE: re-create with the real secret when standing this up on a new project.
-- select cron.schedule('cleanup-reactions-hourly', '17 * * * *', $cmd$
--   select net.http_post(
--     url := 'https://<ref>.supabase.co/functions/v1/cleanup-reactions',
--     headers := jsonb_build_object('Content-Type','application/json','x-cleanup-secret','<CLEANUP_SECRET>')
--   );
-- $cmd$);
