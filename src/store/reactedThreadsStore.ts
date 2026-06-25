import { create } from 'zustand';

/**
 * Thread ids the current user has just reacted to, marked optimistically the moment the
 * reaction row is committed (BEFORE the relay upload and the trailing
 * thread_members.status='reacted' write land). The Feed overlays these as 'reacted' so the
 * actionable row disappears INSTANTLY and REACTIVELY — instead of waiting on a focus-reload
 * that (a) may not re-fire when the full-screen recorder modal dismisses and (b) races ahead
 * of the fire-and-forget background save, reading stale 'pending'/'seen' status (the bug:
 * a friend's share stayed in the Feed after reacting until a manual pull-to-refresh).
 *
 * reconcile() drops ids once a server fetch reports them 'reacted', handing authority back to
 * the server and keeping the set bounded. The thread-view equivalent is pendingReactionsStore.
 */
interface ReactedThreadsState {
  reacted: Set<string>;
  /** Optimistically mark a thread reacted (call when the reaction row is committed). */
  markReacted: (threadId: string) => void;
  /** Drop any locally-marked ids the server now reports reacted. */
  reconcile: (serverReactedIds: string[]) => void;
}

export const useReactedThreadsStore = create<ReactedThreadsState>((set) => ({
  reacted: new Set(),

  markReacted: (threadId) =>
    set(s => (s.reacted.has(threadId) ? s : { reacted: new Set(s.reacted).add(threadId) })),

  reconcile: (serverReactedIds) =>
    set(s => {
      if (!s.reacted.size || !serverReactedIds.length) { return s; }
      const seen = new Set(serverReactedIds);
      const next = new Set(s.reacted);
      let changed = false;
      for (const id of s.reacted) { if (seen.has(id)) { next.delete(id); changed = true; } }
      return changed ? { reacted: next } : s;
    }),
}));
