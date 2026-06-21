import { create } from 'zustand';
import type { ChannelPost } from '../infrastructure/supabase/queries/channels';

/**
 * Optimistic, device-local channel-post reactions — committed (row inserted + clip
 * saved locally) but whose cloud relay upload hasn't finished. ChannelPostScreen only
 * refetches on focus, which races ahead of the backgrounded save, so a freshly-posted
 * reaction wouldn't appear under the video until you left and reopened the post. We
 * surface it here immediately — playable from the local copy — keyed by the parent
 * post id, and drop it once the server row is fetched. Mirrors pendingReactionsStore
 * (friend threads) for channel posts (any source platform).
 */
interface PendingChannelReactionsState {
  byPost: Record<string, ChannelPost[]>;
  add: (parentPostId: string, reaction: ChannelPost) => void;
  remove: (parentPostId: string, id: string) => void;
  /** Drop pending entries for a post whose id now appears in a server fetch. */
  reconcile: (parentPostId: string, serverIds: string[]) => void;
}

export const usePendingChannelReactionsStore = create<PendingChannelReactionsState>((set) => ({
  byPost: {},

  add: (parentPostId, reaction) =>
    set(s => {
      const list = s.byPost[parentPostId] ?? [];
      if (list.some(p => p.id === reaction.id)) { return s; }
      return { byPost: { ...s.byPost, [parentPostId]: [...list, reaction] } };
    }),

  remove: (parentPostId, id) =>
    set(s => {
      const list = s.byPost[parentPostId];
      if (!list) { return s; }
      return { byPost: { ...s.byPost, [parentPostId]: list.filter(p => p.id !== id) } };
    }),

  reconcile: (parentPostId, serverIds) =>
    set(s => {
      const list = s.byPost[parentPostId];
      if (!list || !list.length || !serverIds.length) { return s; }
      const seen = new Set(serverIds);
      const next = list.filter(p => !seen.has(p.id));
      return next.length === list.length ? s : { byPost: { ...s.byPost, [parentPostId]: next } };
    }),
}));
