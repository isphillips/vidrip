-- Creator channels: private + invite-only by default, with a manual "public
-- visibility" toggle (groups.is_public) that gates whether they're listed on the
-- public Channels screen.
--
-- 1) New Members Only channels start invite-only. is_public keeps its default of
--    false, so a freshly created creator channel is NOT listed until the owner
--    flips public visibility. A BEFORE INSERT trigger enforces invite_only so the
--    sync-oauth edge function doesn't need to change.
create or replace function public.default_members_only_private()
returns trigger
language plpgsql
as $$
begin
  if new.is_members_only then
    new.invite_only := true;   -- private access by default; is_public stays false (unlisted)
  end if;
  return new;
end;
$$;

drop trigger if exists trg_members_only_private on public.groups;
create trigger trg_members_only_private
  before insert on public.groups
  for each row execute function public.default_members_only_private();

-- 2) Preserve current behaviour for channels that already exist: keep them listed
--    by marking them public. Only newly created channels default to private.
update public.groups set is_public = true
  where is_members_only = true and is_public = false;
