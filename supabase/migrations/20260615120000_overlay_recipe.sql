-- Creator-studio videos store their animated overlay layer as a small JSON "recipe" that is
-- replayed live in-app over the (trim/colour/mirror-baked) source video, instead of baking
-- the animation into the MP4. NULL = no overlay layer.
alter table public.channel_posts add column if not exists overlay_recipe jsonb;
