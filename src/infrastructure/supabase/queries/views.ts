import { supabase } from '../client';

// View tracking for channel content (source videos + reaction/review clips). Counted
// unique-per-viewer-per-day server-side (see migration 0011_content_views.sql) — so a
// user replaying the same clip the same day only counts once. Fire-and-forget: a view
// must never block or break playback, so failures are swallowed.
export type ViewContentType = 'post' | 'review';

export function recordView(type: ViewContentType, id: string | null | undefined): void {
  if (!id) { return; }
  (supabase as any).rpc('record_view', { p_type: type, p_id: id }).then(
    () => {}, () => {}, // ignore success + failure (best-effort)
  );
}
