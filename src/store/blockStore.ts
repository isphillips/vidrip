import { create } from 'zustand';
import { fetchBlockedIds, blockUser, unblockUser } from '../infrastructure/supabase/queries/blocks';

/**
 * App-wide block state. `blocked` is the set of user ids hidden from me (people I blocked +
 * people who blocked me). Loaded once after auth; surfaces read `isBlocked(id)` to filter.
 */
interface BlockState {
  blocked: Set<string>;
  load: (myId: string) => Promise<void>;
  block: (id: string) => Promise<void>;
  unblock: (id: string) => Promise<void>;
  isBlocked: (id: string | null | undefined) => boolean;
}

export const useBlockStore = create<BlockState>((set, get) => ({
  blocked: new Set(),
  load: async (myId) => {
    try { set({ blocked: new Set(await fetchBlockedIds(myId)) }); } catch { /* ignore */ }
  },
  block: async (id) => {
    await blockUser(id);
    set(s => { const n = new Set(s.blocked); n.add(id); return { blocked: n }; });
  },
  unblock: async (id) => {
    await unblockUser(id);
    set(s => { const n = new Set(s.blocked); n.delete(id); return { blocked: n }; });
  },
  isBlocked: (id) => !!id && get().blocked.has(id),
}));
