-- Reactability ranking — fold Vidrip's proprietary signal (which videos actually
-- make people record a reaction) into the personalized browse grid. A video's
-- reactability = distinct users who reacted to it, log-damped so a few viral hits
-- don't dominate, normalized to [0,1]. This lifts proven-engaging shorts for
-- everyone, and crucially gives cold-start users (no affinity yet) the best content
-- up front instead of just the most recent.
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
  -- Reactability: distinct reactors per video, log-damped + normalized. Joined to
  -- shorts so it only ranks browseable content.
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
  )
  select sh.video_id, sh.title, sh.thumbnail, sh.channel as channel_title,
         coalesce(sh.duration, 0) as duration, sh.category, sh.fetched_at,
         ( exp(-extract(epoch from (now() - sh.fetched_at)) / (60*60*24*5.0)) * 0.5
           + coalesce(cw.w, 0) * 1.0      -- personal category affinity
           + coalesce(hw.w, 0) * 0.7      -- personal channel affinity
           + coalesce(rw.w, 0) * 0.8      -- reactability (proven engaging)
           -- deterministic per-video exploration in [0, 0.12)
           + (('x' || substr(md5(sh.video_id), 1, 8))::bit(32)::bigint::float8
              / 4294967295.0) * 0.12
         )::float8 as score
  from shorts sh
  left join cat_w   cw on cw.category = sh.category
  left join chan_w  hw on hw.channel  = sh.channel
  left join react_w rw on rw.vid      = sh.video_id
  where sh.video_id not in (select vid from reacted)
  order by score desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;
