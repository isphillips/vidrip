import { create } from 'zustand';

// Bridges the "needs your reaction" count from FeedHomeScreen to the tab-bar badge.
interface FeedState {
  toReactCount: number;
  setToReactCount: (n: number) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  toReactCount: 0,
  setToReactCount: (toReactCount) => set({ toReactCount }),
}));
