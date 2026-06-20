import { create } from 'zustand';
import type { OverlayRecipe } from '../features/studio/effectRecipe';

// A queue of background bake requests, fulfilled by the app-root <BakeQueueHost />. Lets heavy
// silhouette/voice anonymization run off-screen (a toast shows progress) instead of blocking the
// recorder — the recorder can navigate away immediately while the bake finishes globally.
export type BakeRequest = {
  id: string;
  sourceUri: string;
  recipe: OverlayRecipe | null;
  durationSec: number;
  voiceMod: 'deep' | null;
  fps?: number;
  resolve: (uri: string) => void;
  reject: (e: unknown) => void;
};

interface BakeQueueState {
  queue: BakeRequest[];
  /** Enqueue a bake; resolves with the baked file uri (or rejects). Processed by BakeQueueHost. */
  requestBake: (opts: { sourceUri: string; recipe: OverlayRecipe | null; durationSec: number; voiceMod: 'deep' | null; fps?: number }) => Promise<string>;
  /** Remove a finished request from the queue (called by the host). */
  complete: (id: string) => void;
}

let _counter = 0;

export const useBakeQueueStore = create<BakeQueueState>((set) => ({
  queue: [],
  requestBake(opts) {
    return new Promise<string>((resolve, reject) => {
      const id = String(++_counter);
      set((s) => ({ queue: [...s.queue, { id, ...opts, resolve, reject }] }));
    });
  },
  complete(id) {
    set((s) => ({ queue: s.queue.filter((r) => r.id !== id) }));
  },
}));
