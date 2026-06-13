-- Channel-diversified category browsing. The plain category query ordered by
-- fetched_at, but the channel ingester inserts a creator's uploads in one batch with
-- the same fetched_at, so they cluster. This RPC applies the same channel round-robin
-- used by For You / Trending: rank each video within its channel by recency, then
-- order by that within-channel rank first. Deterministic → stable pagination.
-- p_category = 'all' returns every category.
create or replace function public.fetch_category_shorts(
  p_category text,
  p_limit    int default 50,
  p_offset   int default 0
)
returns table (
  video_id      text,
  title         text,
  thumbnail     text,
  channel_title text,
  duration      int,
  category      text,
  fetched_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select sh.video_id, sh.title, sh.thumbnail, sh.channel as channel_title,
           coalesce(sh.duration, 0) as duration, sh.category, sh.fetched_at,
           coalesce(nullif(sh.channel_id, ''), nullif(sh.channel, ''), sh.video_id) as group_key
    from shorts sh
    where p_category = 'all' or sh.category = p_category
  ),
  ranked as (
    select base.*,
           row_number() over (partition by group_key order by fetched_at desc) as ch_rank
    from base
  )
  select video_id, title, thumbnail, channel_title, duration, category, fetched_at
  from ranked
  order by ch_rank asc, fetched_at desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

grant execute on function public.fetch_category_shorts(text, int, int) to authenticated, anon;
