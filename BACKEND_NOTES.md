# Backend Changes Needed (REQUIRES Chase + Manny approval before applying)

Found during the front-end audit. **No backend code has been touched.** Each entry says what
needs to change server-side, why, and what front-end change (if any) was already made in
anticipation. Apply these only after Chase + Manny sign off.

> Backend = `supabase/` (edge functions, migrations), Supabase DB/RLS/grants/storage policies,
> and anything applied via the Management API.

---

## Open items

_(none yet — audit in progress)_

---

## Reference: already-applied backend fix this session (for context)
- `20260617030000_reaction_video_url_grant.sql` — grant `update(video_url)` on `reactions` +
  backfill. Applied live 2026-06-17 with Chase's approval BEFORE this no-backend-changes rule.
  Listed here only so the history is complete; nothing further to do.
