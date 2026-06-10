-- Adaptive source audio on reaction playback.
--
-- recorded_with_headphones = true  → the reactor wore headphones while recording,
--   so the mic captured ONLY their voice (the source was NOT acoustically captured).
--   On playback we therefore play the LIVE source alongside the recording.
--
-- false (the default, and every legacy row) → the source played out the phone
--   speaker during recording and was captured by the mic (bleed). The recording
--   already contains the source, so on playback we MUTE the live source to avoid
--   hearing it twice (echo).
alter table public.reactions
  add column if not exists recorded_with_headphones boolean not null default false;

alter table public.channel_posts
  add column if not exists recorded_with_headphones boolean not null default false;
