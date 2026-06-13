-- Hybrid Trending: blends FIRST-PARTY velocity (reactions + shares in the last 48h,
-- which is fresh, proprietary, and zero-quota) WITH the existing mostPopular
-- 'trending' bucket as a baseline (so the tab still has content while engagement
-- data is sparse). Velocity dominates; mostPopular fills in. Channel round-robin +
-- deterministic exploration keep it diverse and paginatable.
create or replace function public.fetch_trending(
  p_user_id uuid,
  p_limit   int default 50,
  p_offset  int default 0
)
returns table (
  video_id      text,
  title         text,
  thumbnail     text,
  channel_title text,
  duration      int,
  category      text,
  fetched_at    timestamptz,
  score         float8
)
language sql
security definer
set search_path = public
as $$
  with engagement as (
    select yt_video_id as vid, created_at, 1.0::float8 as w
    from reactions
    where yt_video_id is not null and created_at > now() - interval '48 hours'
    union all
    select video_id, created_at, 1.5::float8           -- a share is stronger intent
    from threads
    where video_id is not null and created_at > now() - interval '48 hours'
  ),
  vel as (
    -- recency-decayed engagement per video (~1-day time constant)
    select vid, sum(w * exp(-extract(epoch from (now() - created_at)) / (60*60*24.0)))::float8 as vscore
    from engagement group by vid
  ),
  vel_norm as (
    select vid, ln(1 + vscore) / nullif((select max(ln(1 + vscore)) from vel), 0) as v from vel
  ),
  reacted as (
    select distinct yt_video_id as vid from reactions
    where user_id = p_user_id and yt_video_id is not null
  ),
  scored as (
    select sh.video_id, sh.title, sh.thumbnail, sh.channel as channel_title,
           coalesce(sh.duration, 0) as duration, sh.category, sh.fetched_at,
           coalesce(nullif(sh.channel_id, ''), nullif(sh.channel, ''), sh.video_id) as group_key,
           ( coalesce(vn.v, 0) * 1.0                                       -- community velocity (dominant)
             + (case when sh.category = 'trending' then 0.6 else 0 end)    -- mostPopular baseline...
               * exp(-extract(epoch from (now() - sh.fetched_at)) / (60*60*24.0))  -- ...decayed by pull recency
             + (('x' || substr(md5(sh.video_id), 1, 8))::bit(32)::bigint::float8
                / 4294967295.0) * 0.1
           )::float8 as score
    from shorts sh
    left join vel_norm vn on vn.vid = sh.video_id
    -- candidates = anything with recent community engagement OR a mostPopular trending row
    where (sh.category = 'trending' or vn.v is not null)
      and sh.video_id not in (select vid from reacted)
  ),
  ranked as (
    select scored.*, row_number() over (partition by group_key order by score desc) as ch_rank
    from scored
  )
  select video_id, title, thumbnail, channel_title, duration, category, fetched_at, score
  from ranked
  order by ch_rank asc, score desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

grant execute on function public.fetch_trending(uuid, int, int) to authenticated;
