-- Master switch for the reviews feature per channel, separate from visibility.
--  • reviews_allowed = false → reviewers can't submit reviews at all (no CTA/tabs)
--  • reviews_allowed = true  → reviews can be left; reviews_enabled controls whether
--                              the whole channel sees them vs. the creator-only inbox
-- Defaults to true to preserve existing behavior (reviews were always collectable).
alter table public.groups add column if not exists reviews_allowed boolean not null default true;
