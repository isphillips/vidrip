-- User profile settings: bio, location, and avatar uploads.

alter table public.users add column if not exists bio text;
alter table public.users add column if not exists location text;
-- (users.avatar_url already exists; display_name is edited in-app.)

-- Public avatars bucket, capped to 2MB images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Anyone can read; a user may write only under their own folder: avatars/<uid>/...
do $$ begin
  create policy avatars_read on storage.objects
    for select using (bucket_id = 'avatars');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy avatars_insert_own on storage.objects
    for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy avatars_update_own on storage.objects
    for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy avatars_delete_own on storage.objects
    for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;
