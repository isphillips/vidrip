import { create } from 'zustand';

/**
 * Pending deep-link work, stashed until the navigator is ready (a link can arrive
 * on a cold start before the NavigationContainer/session mount).
 * - pendingUrl: a link handed in via "Share to Vidrip" → ShareHomeScreen pastes it.
 * - pendingReactionId: a vidrip://reaction/:id link → open that reaction.
 * - pendingChannel: a vidrip://channel/:id link → open the room.
 * - pendingChannelReact: a vidrip://channels/:id/react/:postId link (web channel page
 *   "Record Your Reaction in App" CTA) → open the in-app reaction recorder for that post.
 * - pendingInviteCode: a vidrip://invite?code=… link (web registration) → prefill the
 *   invite-code entry so the user finishes onboarding in the app.
 */
interface ShareIntentState {
  pendingUrl: string | null;
  pendingReactionId: string | null;
  pendingChannel: { id: string } | null;
  pendingChannelReact: { channelId: string; postId: string } | null;
  pendingInviteCode: string | null;
  setPendingUrl: (url: string | null) => void;
  setPendingReactionId: (id: string | null) => void;
  setPendingChannel: (c: { id: string } | null) => void;
  setPendingChannelReact: (c: { channelId: string; postId: string } | null) => void;
  setPendingInviteCode: (code: string | null) => void;
}

export const useShareIntentStore = create<ShareIntentState>((set) => ({
  pendingUrl: null,
  pendingReactionId: null,
  pendingChannel: null,
  pendingChannelReact: null,
  pendingInviteCode: null,
  setPendingUrl: (url) => set({ pendingUrl: url }),
  setPendingReactionId: (id) => set({ pendingReactionId: id }),
  setPendingChannel: (c) => set({ pendingChannel: c }),
  setPendingChannelReact: (c) => set({ pendingChannelReact: c }),
  setPendingInviteCode: (code) => set({ pendingInviteCode: code }),
}));
