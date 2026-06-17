-- App-wide user block: when A blocks B, neither sees the other. The block is mutual for
-- visibility purposes, so the SELECT policy lets a user read rows on either side to compute
-- "who is hidden from me" = (people I blocked) UNION (people who blocked me).
-- Applied live 2026-06-16; recorded here. Idempotent.

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.user_blocks enable row level security;
grant select, insert, delete on public.user_blocks to authenticated;

drop policy if exists "user_blocks_select" on public.user_blocks;
create policy "user_blocks_select" on public.user_blocks for select to authenticated
  using (blocker_id = auth.uid() or blocked_id = auth.uid());

drop policy if exists "user_blocks_insert" on public.user_blocks;
create policy "user_blocks_insert" on public.user_blocks for insert to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "user_blocks_delete" on public.user_blocks;
create policy "user_blocks_delete" on public.user_blocks for delete to authenticated
  using (blocker_id = auth.uid());
