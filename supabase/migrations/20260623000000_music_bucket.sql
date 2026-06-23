-- Curated music library for Studio videos. A public bucket "music": creators never upload here —
-- royalty-free tracks are dropped in out-of-band (dashboard / service role). The app streams + downloads
-- tracks via their public URL, and lists the bucket (storage.objects SELECT) to enumerate + read ID3 tags.

-- Create the bucket (or flip an existing one to public). Public => objects are served by URL without auth.
insert into storage.buckets (id, name, public)
values ('music', 'music', true)
on conflict (id) do update set public = true;

-- The public flag covers URL downloads/streaming, but the JS .list() call goes through RLS on
-- storage.objects — so allow read/enumerate of this bucket for both anon and signed-in users.
drop policy if exists "music_public_read" on storage.objects;
create policy "music_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'music');

-- Writes stay locked down (no insert/update/delete policy) → only the service role can add/remove tracks.
