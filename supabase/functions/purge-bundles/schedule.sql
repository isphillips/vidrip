-- Weekly schedule for the purge-bundles edge function.
--
-- Run this ONCE in the hot-updater project's SQL editor (Supabase Dashboard → SQL Editor).
-- It's idempotent — re-running just updates the existing job.
--
-- Prerequisites:
--   1. Deploy the function:  supabase functions deploy purge-bundles
--   2. The function reads INTERNAL_SECRET from its env (already shared with the other internal
--      cron functions). Confirm it's set:  supabase secrets list
--   3. Store that SAME value in Vault so this cron SQL can send it as the x-internal-secret header:
--        Dashboard → Project Settings → Vault → New secret
--        name = internal_secret,  value = <the INTERNAL_SECRET value>
--
-- Retention is configured via the function's env (optional overrides):
--   PURGE_KEEP_PER_GROUP (default 2), PURGE_GRACE_DAYS (default 14), PURGE_ASSET_GC (default true).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drop any prior job with this name so this script can be re-run safely.
do $$
begin
  perform cron.unschedule('purge-hot-updater-bundles');
exception when others then null;
end $$;

select cron.schedule(
  'purge-hot-updater-bundles',
  '0 9 * * 0',  -- weekly · Sundays 09:00 UTC (off-peak; not tied to deploys so the previous build stays available for quick rollback)
  $$
  select net.http_post(
    url     := 'https://ltpscwticavqutbzrrjb.supabase.co/functions/v1/purge-bundles',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Verify:        select * from cron.job where jobname = 'purge-hot-updater-bundles';
-- Run history:   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'purge-hot-updater-bundles') order by start_time desc limit 5;
-- Run on demand: select cron.schedule(...) is not needed — instead just invoke the function (see README below).
