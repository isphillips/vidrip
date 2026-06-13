import { create } from 'zustand';

/**
 * Pending deep-link work, stashed until the navigator is ready (a link can arrive
 * on a cold start before the NavigationContainer/session mount).
 * - pendingUrl: a link handed in via "Share to Vidrip" → ShareHomeScreen pastes it.
 * - pendingReactionId: a reaxn://reaction/:id link → open that reaction.
 * - pendingChannel: a reaxn://channel/:id link (e.g. post-subscribe) → open the room.
 */
interface ShareIntentState {
  pendingUrl: string | null;
  pendingReactionId: string | null;
  pendingChannel: { id: string; justSubscribed: boolean } | null;
  // After a fresh subscribe, ChannelsHome should land on the My Subscriptions tab.
  subscribedTabPending: boolean;
  setPendingUrl: (url: string | null) => void;
  setPendingReactionId: (id: string | null) => void;
  setPendingChannel: (c: { id: string; justSubscribed: boolean } | null) => void;
  setSubscribedTabPending: (v: boolean) => void;
}

export const useShareIntentStore = create<ShareIntentState>((set) => ({
  pendingUrl: null,
  pendingReactionId: null,
  pendingChannel: null,
  subscribedTabPending: false,
  setPendingUrl: (url) => set({ pendingUrl: url }),
  setPendingReactionId: (id) => set({ pendingReactionId: id }),
  setPendingChannel: (c) => set({ pendingChannel: c }),
  setSubscribedTabPending: (v) => set({ subscribedTabPending: v }),
}));
