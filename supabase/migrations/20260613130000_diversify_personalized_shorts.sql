-- Diversify the personalized feed by channel. The channel ingester inserts a
-- creator's newest uploads together (same fetched_at + same channel/category
-- affinity), so their scores cluster and the videos sort adjacent. Fix: rank each
-- video WITHIN its channel by score, then order by that within-channel rank first —
-- so the feed surfaces one video per channel before any channel's second, etc.
-- Still fully deterministic, so pagination stays stable.
create or replace function public.fetch_personalized_shorts(
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
  with engaged as (
    select s.category, s.channel
    from reactions r join shorts s on s.video_id = r.yt_video_id
    where r.user_id = p_user_id
    union all
    select s.category, s.channel
    from threads t join shorts s on s.video_id = t.video_id
    where t.sender_id = p_user_id
    union all
    select s.category, s.channel
    from video_comments c join shorts s on s.video_id = c.root_source_id
    where c.author_id = p_user_id
  ),
  cat as (
    select e.category, count(*)::float8 as c from engaged e
    where e.category is not null group by e.category
  ),
  cat_w as (
    select category, c / nullif((select max(c) from cat), 0) as w from cat
  ),
  chan as (
    select e.channel, count(*)::float8 as c from engaged e
    where e.channel is not null and e.channel <> '' group by e.channel
  ),
  chan_w as (
    select channel, c / nullif((select max(c) from chan), 0) as w from chan
  ),
  react as (
    select r.yt_video_id as vid, ln(1 + count(distinct r.user_id))::float8 as lc
    from reactions r
    where r.yt_video_id is not null
    group by r.yt_video_id
  ),
  react_w as (
    select vid, lc / nullif((select max(lc) from react), 0) as w from react
  ),
  reacted as (
    select distinct yt_video_id as vid from reactions
    where user_id = p_user_id and yt_video_id is not null
  ),
  scored as (
    select sh.video_id, sh.title, sh.thumbnail, sh.channel as channel_title,
           coalesce(sh.duration, 0) as duration, sh.category, sh.fetched_at,
           -- group videos by channel for the diversity pass: prefer channel_id, then
           -- the channel name (some rows have no channel_id), then video_id so truly
           -- channel-less shorts each stand alone instead of bunching together.
           coalesce(nullif(sh.channel_id, ''), nullif(sh.channel, ''), sh.video_id) as group_key,
           ( exp(-extract(epoch from (now() - sh.fetched_at)) / (60*60*24*5.0)) * 0.5
             + coalesce(cw.w, 0) * 1.0
             + coalesce(hw.w, 0) * 0.7
             + coalesce(rw.w, 0) * 0.8
             + (('x' || substr(md5(sh.video_id), 1, 8))::bit(32)::bigint::float8
                / 4294967295.0) * 0.12
           )::float8 as score
    from shorts sh
    left join cat_w   cw on cw.category = sh.category
    left join chan_w  hw on hw.channel  = sh.channel
    left join react_w rw on rw.vid      = sh.video_id
    where sh.video_id not in (select vid from reacted)
  ),
  ranked as (
    select scored.*,
           row_number() over (partition by group_key order by score desc) as ch_rank
    from scored
  )
  select video_id, title, thumbnail, channel_title, duration, category, fetched_at, score
  from ranked
  -- one per channel first (ch_rank=1), then seconds, etc.; best score within each tier.
  order by ch_rank asc, score desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;
