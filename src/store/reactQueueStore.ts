import { create } from 'zustand';

// "Doom-reacting" queue: tapping a Feed entry opens the first pending video to react to, then chains
// through the rest. The currently-open target rides in the RecordReaction route params; this store
// holds only the REMAINING targets after it. Cleared when the user backs out or the queue drains.
// A target is either a friend/group video share ('thread') or a followed-channel post ('channel');
// both record through the same RecordReaction screen so one queue can chain across them.
export type ReactTarget = {
  kind?: 'thread' | 'channel';
  // Thread (friend/group share) target:
  threadId?: string;
  videoId?: string;
  sourceType?: 'youtube' | 'tiktok' | 'instagram' | 'studio';
  sourceUri?: string;
  // Channel-post target — RecordReaction resolves the source lazily via fetchChannelPost(postId).
  postId?: string;
  channelId?: string;
};

interface ReactQueueState {
  queue: ReactTarget[];
  setQueue: (q: ReactTarget[]) => void;
  shiftNext: () => ReactTarget | null;
  clear: () => void;
}

export const useReactQueueStore = create<ReactQueueState>((set, get) => ({
  queue: [],
  setQueue: (q) => set({ queue: q }),
  shiftNext: () => {
    const [next, ...rest] = get().queue;
    if (!next) { return null; }
    set({ queue: rest });
    return next;
  },
  clear: () => set({ queue: [] }),
}));
