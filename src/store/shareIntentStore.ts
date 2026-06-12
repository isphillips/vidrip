import { create } from 'zustand';

/**
 * Pending deep-link work, stashed until the navigator is ready (a link can arrive
 * on a cold start before the NavigationContainer/session mount).
 * - pendingUrl: a link handed in via "Share to Vidrip" → ShareHomeScreen pastes it.
 * - pendingReactionId: a reaxn://reaction/:id link → open that reaction.
 */
interface ShareIntentState {
  pendingUrl: string | null;
  pendingReactionId: string | null;
  setPendingUrl: (url: string | null) => void;
  setPendingReactionId: (id: string | null) => void;
}

export const useShareIntentStore = create<ShareIntentState>((set) => ({
  pendingUrl: null,
  pendingReactionId: null,
  setPendingUrl: (url) => set({ pendingUrl: url }),
  setPendingReactionId: (id) => set({ pendingReactionId: id }),
}));
