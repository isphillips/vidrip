-- Personalized browse feed — no external search/recommendation API. Both RPCs mine
-- first-party behavior (reactions / shares / comments / the friend graph) against the
-- existing `shorts` pool. Pure SQL, SECURITY DEFINER so they can read across users'
-- reactions/threads for collaborative signals while staying read-only.

-- ── 1. Friends Trending ───────────────────────────────────────────────────────
-- Short-form videos the caller's accepted friends have reacted to or shared in the
-- recent window, that the caller hasn't already reacted to. Shares weigh more than
-- reactions (higher intent); score decays with age. Metadata comes from `shorts`
-- when the video is in the pool, else from the share row itself (threads carry a
-- title + thumbnail), so pasted-link shares still render.
create or replace function public.fetch_friends_trending(
  p_user_id uuid,
  p_limit   int default 50,
  p_offset  int default 0
)
returns table (
  video_id      text,
  title         text,
  thumbnail     text,
  channel_title text,
  source_type   text,
  duration      int,
  friend_count  int,
  score         float8,
  last_at       timestamptz
)
language sql
security definer
set search_path = public
as $$
  with friends as (
    select user_b as fid from friendships where user_a = p_user_id and status = 'accepted'
    union
    select user_a as fid from friendships where user_b = p_user_id and status = 'accepted'
  ),
  events as (
    -- friend reactions (weight 1.0)
    select r.yt_video_id as vid, coalesce(r.source_type, 'youtube') as st,
           r.user_id as friend, r.created_at as at, 1.0::float8 as w,
           null::text as s_title, null::text as s_thumb
    from reactions r
    where r.user_id in (select fid from friends)
      and r.yt_video_id is not null
      and r.created_at > now() - interval '21 days'
    union all
    -- friend shares (weight 1.5 — stronger intent)
    select t.video_id, coalesce(t.source_type, 'youtube'),
           t.sender_id, t.created_at, 1.5::float8,
           t.video_title, t.video_thumbnail
    from threads t
    where t.sender_id in (select fid from friends)
      and t.video_id is not null
      and t.created_at > now() - interval '21 days'
  ),
  agg as (
    select vid, st,
           count(distinct friend)::int as friend_count,
           -- recency-decayed engagement, ~7-day time constant
           sum(w * exp(-extract(epoch from (now() - at)) / (60*60*24*7.0)))::float8 as score,
           max(at) as last_at,
           max(s_title) as s_title,
           max(s_thumb) as s_thumb
    from events
    group by vid, st
  ),
  mine as (
    select distinct yt_video_id as vid, coalesce(source_type, 'youtube') as st
    from reactions where user_id = p_user_id and yt_video_id is not null
  )
  select a.vid,
         coalesce(s.title, a.s_title, '') as title,
         coalesce(s.thumbnail, a.s_thumb) as thumbnail,
         coalesce(s.channel, '') as channel_title,
         a.st as source_type,
         coalesce(s.duration, 0) as duration,
         a.friend_count,
         a.score,
         a.last_at
  from agg a
  left join shorts s on s.video_id = a.vid
  where not exists (select 1 from mine m where m.vid = a.vid and m.st = a.st)
    and coalesce(s.thumbnail, a.s_thumb) is not null
  order by a.score desc, a.last_at desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

-- ── 2. Personalized Shorts ────────────────────────────────────────────────────
-- Re-ranks the `shorts` pool by the caller's own category + channel affinity (mined
-- from their reactions / shares / comments), blended with recency. A small
-- deterministic exploration term (hashed from video_id, so pagination stays stable)
-- keeps the feed from collapsing into one category. Users with no history fall back
-- to ~recency order, matching today's behavior.
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
  reacted as (
    select distinct yt_video_id as vid from reactions
    where user_id = p_user_id and yt_video_id is not null
  )
  select sh.video_id, sh.title, sh.thumbnail, sh.channel as channel_title,
         coalesce(sh.duration, 0) as duration, sh.category, sh.fetched_at,
         ( exp(-extract(epoch from (now() - sh.fetched_at)) / (60*60*24*5.0)) * 0.5
           + coalesce(cw.w, 0) * 1.0
           + coalesce(hw.w, 0) * 0.7
           -- deterministic per-video exploration in [0, 0.12)
           + (('x' || substr(md5(sh.video_id), 1, 8))::bit(32)::bigint::float8
              / 4294967295.0) * 0.12
         )::float8 as score
  from shorts sh
  left join cat_w cw on cw.category = sh.category
  left join chan_w hw on hw.channel = sh.channel
  where sh.video_id not in (select vid from reacted)
  order by score desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

grant execute on function public.fetch_friends_trending(uuid, int, int) to authenticated;
grant execute on function public.fetch_personalized_shorts(uuid, int, int) to authenticated;
