-- Allow Facebook as a synced creator account (Facebook Pages → Reels via the Graph
-- API). Reels live on a Page, so the connect flow lists the user's Pages and imports
-- the chosen Page's reels. source_type columns are plain text; only these provider
-- CHECKs need widening.
alter table public.synced_accounts drop constraint if exists synced_accounts_provider_check;
alter table public.synced_accounts add constraint synced_accounts_provider_check
  check (provider = any (array['youtube'::text, 'tiktok'::text, 'instagram'::text, 'facebook'::text]));

-- video_comments are keyed by (root_source_id, source_type); widen so comments can
-- attach to imported Facebook reels too.
alter table public.video_comments drop constraint if exists vc_source_type_check;
alter table public.video_comments add constraint vc_source_type_check
  check (source_type = any (array['youtube'::text, 'tiktok'::text, 'instagram'::text, 'facebook'::text]));
