import { create } from 'zustand';

// "Doom-reacting" queue: tapping a Feed entry opens the first pending video to react to, then chains
// through the rest. The currently-open target rides in the RecordReaction route params; this store
// holds only the REMAINING targets after it. Cleared when the user backs out or the queue drains.
export type ReactTarget = {
  threadId: string;
  videoId?: string;
  sourceType?: 'youtube' | 'tiktok' | 'instagram' | 'studio';
  sourceUri?: string;
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
