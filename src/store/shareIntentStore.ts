import { create } from 'zustand';

/**
 * Holds a link handed to us by the OS "Share to Vidrip" flow (Android ACTION_SEND
 * rewritten into reaxn://share, or the iOS Share Extension). ShareHomeScreen reads
 * it, drops into Paste mode, and pre-fills the URL so it runs the normal
 * validate → preview → share flow.
 */
interface ShareIntentState {
  pendingUrl: string | null;
  setPendingUrl: (url: string | null) => void;
}

export const useShareIntentStore = create<ShareIntentState>((set) => ({
  pendingUrl: null,
  setPendingUrl: (url) => set({ pendingUrl: url }),
}));
