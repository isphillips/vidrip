-- ============================================================
-- REAXN — Initial Schema
-- Tables first, policies after (avoids forward-reference errors)
-- ============================================================

-- ── Tables ───────────────────────────────────────────────────

create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  handle        text not null unique,
  display_name  text not null,
  avatar_url    text,
  invite_code_used text,
  created_at    timestamptz not null default now()
);

create table public.invite_codes (
  code        text primary key,
  created_by  uuid not null references public.users(id) on delete cascade,
  used_by     uuid references public.users(id) on delete set null,
  used_at     timestamptz
);

create table public.friendships (
  id          uuid primary key default gen_random_uuid(),
  user_a      uuid not null references public.users(id) on delete cascade,
  user_b      uuid not null references public.users(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  unique (user_a, user_b)
);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  primary key (group_id, user_id)
);

create table public.threads (
  id                uuid primary key default gen_random_uuid(),
  video_id          text not null,
  video_title       text,
  video_thumbnail   text,
  sender_id         uuid not null references public.users(id) on delete cascade,
  group_id          uuid references public.groups(id) on delete set null,
  created_at        timestamptz not null default now()
);

create table public.thread_members (
  thread_id  uuid not null references public.threads(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'seen', 'reacted')),
  primary key (thread_id, user_id)
);

create table public.reactions (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.threads(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  video_url   text not null,
  duration    integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.emoji_reactions (
  id           uuid primary key default gen_random_uuid(),
  reaction_id  uuid not null references public.reactions(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  emoji        text not null,
  created_at   timestamptz not null default now(),
  unique (reaction_id, user_id, emoji)
);


-- ── Enable RLS on all tables ─────────────────────────────────

alter table public.users enable row level security;
alter table public.invite_codes enable row level security;
alter table public.friendships enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.threads enable row level security;
alter table public.thread_members enable row level security;
alter table public.reactions enable row level security;
alter table public.emoji_reactions enable row level security;


-- ── Policies: users ──────────────────────────────────────────

create policy "users: read any"
  on public.users for select
  using (auth.role() = 'authenticated');

create policy "users: update own"
  on public.users for update
  using (auth.uid() = id);

create policy "users: insert own"
  on public.users for insert
  with check (auth.uid() = id);


-- ── Policies: invite_codes ───────────────────────────────────

create policy "invite_codes: read"
  on public.invite_codes for select
  using (true);

create policy "invite_codes: insert own"
  on public.invite_codes for insert
  with check (auth.uid() = created_by);


-- ── Policies: friendships ────────────────────────────────────

create policy "friendships: read own"
  on public.friendships for select
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "friendships: insert"
  on public.friendships for insert
  with check (auth.uid() = user_a);

create policy "friendships: update"
  on public.friendships for update
  using (auth.uid() = user_b);

create policy "friendships: delete own"
  on public.friendships for delete
  using (auth.uid() = user_a or auth.uid() = user_b);


-- ── Policies: groups ─────────────────────────────────────────

create policy "groups: read member"
  on public.groups for select
  using (
    exists (
      select 1 from public.group_members
      where group_id = id and user_id = auth.uid()
    )
  );

create policy "groups: insert"
  on public.groups for insert
  with check (auth.uid() = created_by);

create policy "groups: update own"
  on public.groups for update
  using (auth.uid() = created_by);

create policy "groups: delete own"
  on public.groups for delete
  using (auth.uid() = created_by);


-- ── Policies: group_members ──────────────────────────────────

create policy "group_members: read member"
  on public.group_members for select
  using (
    user_id = auth.uid() or
    exists (
      select 1 from public.group_members gm
      where gm.group_id = group_id and gm.user_id = auth.uid()
    )
  );

create policy "group_members: insert by creator"
  on public.group_members for insert
  with check (
    exists (
      select 1 from public.groups
      where id = group_id and created_by = auth.uid()
    )
  );

create policy "group_members: delete by creator or self"
  on public.group_members for delete
  using (
    user_id = auth.uid() or
    exists (
      select 1 from public.groups
      where id = group_id and created_by = auth.uid()
    )
  );


-- ── Policies: threads ────────────────────────────────────────

create policy "threads: read member"
  on public.threads for select
  using (
    sender_id = auth.uid() or
    exists (
      select 1 from public.thread_members
      where thread_id = id and user_id = auth.uid()
    )
  );

create policy "threads: insert"
  on public.threads for insert
  with check (auth.uid() = sender_id);


-- ── Policies: thread_members ─────────────────────────────────

create policy "thread_members: read"
  on public.thread_members for select
  using (
    user_id = auth.uid() or
    exists (
      select 1 from public.threads
      where id = thread_id and sender_id = auth.uid()
    )
  );

create policy "thread_members: insert by sender"
  on public.thread_members for insert
  with check (
    exists (
      select 1 from public.threads
      where id = thread_id and sender_id = auth.uid()
    )
  );

create policy "thread_members: update own status"
  on public.thread_members for update
  using (auth.uid() = user_id);


-- ── Policies: reactions ──────────────────────────────────────

create policy "reactions: read member"
  on public.reactions for select
  using (
    exists (
      select 1 from public.thread_members
      where thread_id = reactions.thread_id and user_id = auth.uid()
    ) or
    exists (
      select 1 from public.threads
      where id = reactions.thread_id and sender_id = auth.uid()
    )
  );

create policy "reactions: insert own"
  on public.reactions for insert
  with check (auth.uid() = user_id);


-- ── Policies: emoji_reactions ────────────────────────────────

create policy "emoji_reactions: read"
  on public.emoji_reactions for select
  using (
    exists (
      select 1 from public.reactions r
      join public.thread_members tm on tm.thread_id = r.thread_id
      where r.id = reaction_id and tm.user_id = auth.uid()
    ) or
    exists (
      select 1 from public.reactions r
      join public.threads t on t.id = r.thread_id
      where r.id = reaction_id and t.sender_id = auth.uid()
    )
  );

create policy "emoji_reactions: insert own"
  on public.emoji_reactions for insert
  with check (auth.uid() = user_id);

create policy "emoji_reactions: delete own"
  on public.emoji_reactions for delete
  using (auth.uid() = user_id);


-- ── Storage bucket for reaction videos ───────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reactions',
  'reactions',
  false,
  104857600,
  array['video/mp4', 'video/quicktime', 'video/x-m4v']
);

create policy "reactions bucket: upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'reactions' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "reactions bucket: read member"
  on storage.objects for select
  using (
    bucket_id = 'reactions' and
    auth.uid()::text = (storage.foldername(name))[1]
  );


-- ── Auto-create user profile on sign-up ──────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, handle, display_name, invite_code_used)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'handle', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', 'New User'),
    new.raw_user_meta_data->>'invite_code'
  );

  update public.invite_codes
  set used_by = new.id, used_at = now()
  where code = new.raw_user_meta_data->>'invite_code'
    and used_by is null;

  insert into public.invite_codes (code, created_by)
  select
    upper(substr(md5(random()::text), 1, 4) || '-' || substr(md5(random()::text), 1, 4)),
    new.id
  from generate_series(1, 3);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── Indexes ──────────────────────────────────────────────────

create index on public.friendships (user_a);
create index on public.friendships (user_b);
create index on public.threads (sender_id);
create index on public.thread_members (user_id);
create index on public.reactions (thread_id);
create index on public.emoji_reactions (reaction_id);
create index on public.users (handle);
