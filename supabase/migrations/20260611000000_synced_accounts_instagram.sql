-- Allow Instagram as a synced creator account (Instagram Graph API via Facebook
-- Login). source_type columns are plain text, so only this provider CHECK needs
-- widening.
alter table public.synced_accounts drop constraint if exists synced_accounts_provider_check;
alter table public.synced_accounts add constraint synced_accounts_provider_check
  check (provider = any (array['youtube'::text, 'tiktok'::text, 'instagram'::text]));
