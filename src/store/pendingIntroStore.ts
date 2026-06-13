import { create } from 'zustand';

/**
 * Holds a just-recorded share intro clip while the user is still in the share
 * drawer. The intro recorder (RecordIntroScreen, in the root stack) and the
 * share drawer (ShareHomeScreen, in the Share tab) live in different
 * navigators, so this store hands the recorded clip back across them. Consumed
 * and cleared by ShareHomeScreen when the share is sent (or the drawer reopens).
 */
export interface IntroClip {
  path: string;
  duration: number;
}

interface PendingIntroState {
  clip: IntroClip | null;
  set: (clip: IntroClip) => void;
  clear: () => void;
}

export const usePendingIntroStore = create<PendingIntroState>((set) => ({
  clip: null,
  set: (clip) => set({ clip }),
  clear: () => set({ clip: null }),
}));
