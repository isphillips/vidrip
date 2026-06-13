import { create } from 'zustand';
import type { VideoComment } from '../infrastructure/supabase/queries/videoComments';

/**
 * Optimistic, device-local video comments that have been committed (row
 * inserted + clip saved to the local comment-videos dir) but whose cloud
 * upload hasn't finished yet. `get_video_comments` filters `video_url is not
 * null`, so a freshly-posted comment wouldn't appear via a refetch until the
 * relay completes. We surface it here immediately — playable from `local_path`
 * — and drop it once the server-side row (now with a video_url) is fetched.
 */
interface PendingCommentsState {
  pending: VideoComment[];
  /** Add an optimistic comment (no-op if its id is already tracked). */
  add: (comment: VideoComment) => void;
  /** Remove one by id. */
  remove: (id: string) => void;
  /** Drop any pending entries whose id now appears in a server fetch. */
  reconcile: (serverIds: string[]) => void;
}

export const usePendingCommentsStore = create<PendingCommentsState>((set) => ({
  pending: [],

  add: (comment) =>
    set(s => (s.pending.some(p => p.id === comment.id)
      ? s
      : { pending: [comment, ...s.pending] })),

  remove: (id) =>
    set(s => ({ pending: s.pending.filter(p => p.id !== id) })),

  reconcile: (serverIds) =>
    set(s => {
      if (!serverIds.length || !s.pending.length) { return s; }
      const seen = new Set(serverIds);
      const next = s.pending.filter(p => !seen.has(p.id));
      return next.length === s.pending.length ? s : { pending: next };
    }),
}));
