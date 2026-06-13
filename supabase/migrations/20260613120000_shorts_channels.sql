-- Curated-channel ingestion registry. Instead of YouTube `search` (100 quota units),
-- we pull each channel's newest uploads via its uploads playlist (`playlistItems`,
-- 1 unit) — ~100x cheaper, so ingestion can run far more often. Channels are ranked
-- by reactability (distinct users who reacted to that channel's videos), closing the
-- loop: the feed fills from channels our community actually reacts to.

create table if not exists public.shorts_channels (
  channel_id       text primary key,
  channel_title    text,
  category         text not null default 'trending',
  enabled          boolean not null default true,
  added_via        text default 'seed',     -- seed | reaction | connected | manual
  last_fetched_at  timestamptz,
  created_at       timestamptz not null default now()
);

-- Seed from channels already represented in the (vetted, US/English) shorts pool,
-- carrying over each channel's most-recent category as its default bucket.
insert into public.shorts_channels (channel_id, channel_title, category, added_via)
select distinct on (channel_id) channel_id, channel, category, 'seed'
from public.shorts
where channel_id is not null and channel_id <> ''
order by channel_id, fetched_at desc
on conflict (channel_id) do nothing;

-- Ranking for ingestion: highest-reactability channels first, then least-recently
-- fetched so the whole list still cycles (new/cold channels aren't starved).
create or replace function public.pick_channels_to_ingest(p_limit int default 150)
returns table (channel_id text, channel_title text, category text)
language sql
security definer
set search_path = public
as $$
  select c.channel_id, c.channel_title, c.category
  from shorts_channels c
  left join lateral (
    select count(distinct r.user_id) as reactors
    from reactions r
    join shorts s on s.video_id = r.yt_video_id
    where s.channel_id = c.channel_id
  ) rb on true
  where c.enabled
  order by rb.reactors desc nulls last, c.last_fetched_at asc nulls first
  limit greatest(p_limit, 0);
$$;
