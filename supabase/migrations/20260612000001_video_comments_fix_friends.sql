-- Fix get_video_comments: use the explicit friendships table (status='accepted')
-- instead of thread_members for the friend tier. The original used thread_members
-- as a proxy; this replaces it with the real friend graph.

create or replace function public.get_video_comments(
  p_root_source_id    text,
  p_source_type       text,
  p_parent_comment_id uuid        default null,
  p_viewer_id         uuid        default null,
  p_after_emoji       integer     default null,
  p_after_ts          timestamptz default null,
  p_after_id          uuid        default null,
  p_limit             integer     default 20
)
returns table (
  id                  uuid,
  root_source_id      text,
  source_type         text,
  parent_comment_id   uuid,
  author_id           uuid,
  video_url           text,
  duration            integer,
  reply_count         integer,
  emoji_count         integer,
  created_at          timestamptz,
  author_handle       text,
  author_avatar_url   text,
  is_friend           boolean
)
language sql security definer stable as $$
  select
    vc.id,
    vc.root_source_id,
    vc.source_type,
    vc.parent_comment_id,
    vc.author_id,
    vc.video_url,
    vc.duration,
    vc.reply_count,
    vc.emoji_count,
    vc.created_at,
    u.handle          as author_handle,
    u.avatar_url      as author_avatar_url,
    case when p_viewer_id is not null then
      exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and (
            (f.user_a = p_viewer_id and f.user_b = vc.author_id)
            or
            (f.user_b = p_viewer_id and f.user_a = vc.author_id)
          )
      )
    else false end    as is_friend
  from public.video_comments vc
  join public.users u on u.id = vc.author_id
  where vc.root_source_id    = p_root_source_id
    and vc.source_type        = p_source_type
    and (
      (p_parent_comment_id is null and vc.parent_comment_id is null)
      or vc.parent_comment_id = p_parent_comment_id
    )
    and vc.video_url is not null
    and (
      p_after_emoji is null
      or vc.emoji_count < p_after_emoji
      or (vc.emoji_count = p_after_emoji and vc.created_at < p_after_ts)
      or (vc.emoji_count = p_after_emoji and vc.created_at = p_after_ts and vc.id > p_after_id)
    )
  order by
    case when p_viewer_id is not null and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.user_a = p_viewer_id and f.user_b = vc.author_id)
          or
          (f.user_b = p_viewer_id and f.user_a = vc.author_id)
        )
    ) then 0 else 1 end asc,
    vc.emoji_count desc,
    vc.created_at  desc,
    vc.id          asc
  limit p_limit
$$;

grant execute on function public.get_video_comments(text, text, uuid, uuid, integer, timestamptz, uuid, integer)
  to anon, authenticated;
