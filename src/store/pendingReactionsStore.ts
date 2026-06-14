import { create } from 'zustand';
import type { ReactionItem } from '../infrastructure/supabase/queries/threads';

/**
 * Optimistic, device-local reactions that have been committed (row inserted +
 * clip saved locally) but whose cloud relay upload hasn't finished yet. A
 * thread only refetches its reactions on focus, which races ahead of the
 * backgrounded save, so a freshly-posted reaction wouldn't appear until you
 * left and reopened the thread. We surface it here immediately — playable from
 * the local copy — and drop it once the server row is fetched.
 */
interface PendingReactionsState {
  pending: ReactionItem[];
  add: (reaction: ReactionItem) => void;
  remove: (id: string) => void;
  /** Drop any pending entries whose id now appears in a server fetch. */
  reconcile: (serverIds: string[]) => void;
}

export const usePendingReactionsStore = create<PendingReactionsState>((set) => ({
  pending: [],

  add: (reaction) =>
    set(s => (s.pending.some(p => p.id === reaction.id)
      ? s
      : { pending: [...s.pending, reaction] })),

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
