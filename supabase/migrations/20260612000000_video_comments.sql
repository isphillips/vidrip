-- Public Video Comments — Phase 1a: data model, RLS, storage, ordering RPC.
--
-- video_comments is a standalone N-level tree keyed to external shorts by
-- (root_source_id, source_type). It is completely separate from channel_posts:
-- comments are public-read, use a public storage bucket, and need their own
-- permissive RLS that cannot be expressed on the private channel_posts table.
--
-- "Friends" are approximated by shared thread membership — two users are
-- friends if they both appear in at least one reaction thread together.

-- ── Main table ──────────────────────────────────────────────────────────────

create table if not exists public.video_comments (
  id                 uuid        primary key default gen_random_uuid(),
  root_source_id     text        not null,   -- external video ID (yt/tt/ig short)
  source_type        text        not null,   -- 'youtube' | 'tiktok' | 'instagram'
  parent_comment_id  uuid        references public.video_comments(id) on delete cascade,
  author_id          uuid        not null references public.users(id) on delete cascade,
  video_url          text,                   -- null until relay upload completes
  storage_mode       text        not null default 'cloud',
  duration           integer,               -- seconds
  reply_count        integer     not null default 0,  -- trigger-maintained
  emoji_count        integer     not null default 0,  -- trigger-maintained
  created_at         timestamptz not null default now(),
  constraint vc_source_type_check check (source_type in ('youtube', 'tiktok', 'instagram'))
);

-- Fetch all direct comments on a short (parent_comment_id IS NULL, by source).
create index if not exists idx_vc_source
  on public.video_comments (root_source_id, source_type, created_at desc)
  where parent_comment_id is null;

-- Fetch replies to a comment.
create index if not exists idx_vc_replies
  on public.video_comments (parent_comment_id, created_at desc);

-- User's own comment history.
create index if not exists idx_vc_author
  on public.video_comments (author_id, created_at desc);

alter table public.video_comments enable row level security;

-- Public read — anyone (even unauthenticated) can see posted comments.
do $$ begin
  create policy vc_select on public.video_comments
    for select using (true);
exception when duplicate_object then null; end $$;

-- Insert: authenticated users post for themselves only.
-- Moderation is enforced client-side (assertVideoAllowed) before the row is
-- inserted; the row starts with video_url = null and is updated after upload.
do $$ begin
  create policy vc_insert on public.video_comments
    for insert with check (author_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Update: author patches their own row (sets video_url after upload completes).
do $$ begin
  create policy vc_update on public.video_comments
    for update using (author_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Delete: author removes their own comment.
do $$ begin
  create policy vc_delete on public.video_comments
    for delete using (author_id = auth.uid());
exception when duplicate_object then null; end $$;

grant select on public.video_comments to anon;
grant select, insert, update, delete on public.video_comments to authenticated;
grant all on public.video_comments to service_role;

-- ── Emoji reactions ──────────────────────────────────────────────────────────

create table if not exists public.video_comment_emoji_reactions (
  comment_id  uuid  not null references public.video_comments(id) on delete cascade,
  user_id     uuid  not null references public.users(id) on delete cascade,
  emoji       text  not null,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

create index if not exists idx_vcer_comment
  on public.video_comment_emoji_reactions (comment_id);

alter table public.video_comment_emoji_reactions enable row level security;

do $$ begin
  create policy vcer_select on public.video_comment_emoji_reactions
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy vcer_insert on public.video_comment_emoji_reactions
    for insert with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy vcer_delete on public.video_comment_emoji_reactions
    for delete using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

grant select on public.video_comment_emoji_reactions to anon;
grant select, insert, delete on public.video_comment_emoji_reactions to authenticated;
grant all on public.video_comment_emoji_reactions to service_role;

-- ── Denormalized count triggers ──────────────────────────────────────────────

-- reply_count: maintained on the parent comment when a child is inserted/deleted.
create or replace function public.update_comment_reply_count()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' and new.parent_comment_id is not null then
    update public.video_comments
      set reply_count = reply_count + 1
      where id = new.parent_comment_id;
  elsif tg_op = 'DELETE' and old.parent_comment_id is not null then
    update public.video_comments
      set reply_count = greatest(0, reply_count - 1)
      where id = old.parent_comment_id;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_vc_reply_count on public.video_comments;
create trigger trg_vc_reply_count
  after insert or delete on public.video_comments
  for each row execute function public.update_comment_reply_count();

-- emoji_count: maintained on the comment when an emoji row is inserted/deleted.
create or replace function public.update_comment_emoji_count()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update public.video_comments
      set emoji_count = emoji_count + 1
      where id = new.comment_id;
  elsif tg_op = 'DELETE' then
    update public.video_comments
      set emoji_count = greatest(0, emoji_count - 1)
      where id = old.comment_id;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_vcer_emoji_count on public.video_comment_emoji_reactions;
create trigger trg_vcer_emoji_count
  after insert or delete on public.video_comment_emoji_reactions
  for each row execute function public.update_comment_emoji_count();

-- ── Storage bucket ───────────────────────────────────────────────────────────

-- Public read; size cap matches channel_reviews (60s clips). Path pattern:
-- comment-videos/<authorId>/<commentId>.mp4
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comment-videos', 'comment-videos', true, 62914560, array['video/mp4', 'video/quicktime'])
on conflict (id) do update
  set public            = true,
      file_size_limit   = 62914560,
      allowed_mime_types = array['video/mp4', 'video/quicktime'];

do $$ begin
  create policy cv_read on storage.objects
    for select using (bucket_id = 'comment-videos');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy cv_insert_own on storage.objects
    for insert with check (
      bucket_id = 'comment-videos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy cv_delete_own on storage.objects
    for delete using (
      bucket_id = 'comment-videos'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception when duplicate_object then null; end $$;

-- ── Ordering RPC ─────────────────────────────────────────────────────────────

-- Returns one page of comments for a given (source, parent).
-- Tier order: friends (shared thread membership) → most emoji → most recent.
-- Keyed pagination: pass the (emoji_count, created_at, id) tuple of the last
-- row as p_after_emoji / p_after_ts / p_after_id to get the next page.
-- Pass nulls for the first page.
--
-- p_parent_comment_id = null  → direct comments on the short
-- p_parent_comment_id = <id>  → replies to that comment
create or replace function public.get_video_comments(
  p_root_source_id   text,
  p_source_type      text,
  p_parent_comment_id uuid    default null,
  p_viewer_id        uuid    default null,
  p_after_emoji      integer default null,
  p_after_ts         timestamptz default null,
  p_after_id         uuid    default null,
  p_limit            integer default 20
)
returns table (
  id                 uuid,
  root_source_id     text,
  source_type        text,
  parent_comment_id  uuid,
  author_id          uuid,
  video_url          text,
  duration           integer,
  reply_count        integer,
  emoji_count        integer,
  created_at         timestamptz,
  author_handle      text,
  author_avatar_url  text,
  is_friend          boolean
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
    u.handle           as author_handle,
    u.avatar_url       as author_avatar_url,
    -- Friends = share at least one reaction thread with the viewer.
    case when p_viewer_id is not null then
      exists (
        select 1 from public.thread_members tm1
        join  public.thread_members tm2
          on  tm1.thread_id = tm2.thread_id
        where tm1.user_id = p_viewer_id
          and tm2.user_id = vc.author_id
          and tm2.user_id <> p_viewer_id
      )
    else false end     as is_friend
  from public.video_comments vc
  join public.users u on u.id = vc.author_id
  where vc.root_source_id   = p_root_source_id
    and vc.source_type       = p_source_type
    and (
      (p_parent_comment_id is null and vc.parent_comment_id is null)
      or vc.parent_comment_id = p_parent_comment_id
    )
    and vc.video_url is not null  -- only fully-uploaded comments are visible
    -- Keyset cursor: skip rows already returned using (emoji_count desc, created_at desc, id asc)
    and (
      p_after_emoji is null
      or vc.emoji_count < p_after_emoji
      or (vc.emoji_count = p_after_emoji and vc.created_at < p_after_ts)
      or (vc.emoji_count = p_after_emoji and vc.created_at = p_after_ts and vc.id > p_after_id)
    )
  order by
    -- Friends tier: author shares a thread with the viewer (best-effort, may be slow at scale).
    case when p_viewer_id is not null and exists (
      select 1 from public.thread_members tm1
      join  public.thread_members tm2
        on  tm1.thread_id = tm2.thread_id
      where tm1.user_id = p_viewer_id
        and tm2.user_id = vc.author_id
        and tm2.user_id <> p_viewer_id
    ) then 0 else 1 end asc,
    vc.emoji_count desc,
    vc.created_at  desc,
    vc.id          asc
  limit p_limit
$$;

grant execute on function public.get_video_comments(text, text, uuid, uuid, integer, timestamptz, uuid, integer)
  to anon, authenticated;
