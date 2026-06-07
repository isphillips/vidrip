import { create } from 'zustand';
import type { SyncProvider, ConnectionType } from '../infrastructure/oauth/config';

// Bridges the OAuth deep link (caught in RootNavigator) to AccountScreen, which
// runs the actual sync + shows progress.
type OAuthPending = {
  provider: SyncProvider;
  connectionType: ConnectionType;
  code: string | null;
  error: string | null;
};

interface OAuthState {
  pending: OAuthPending | null;
  setPending: (p: OAuthPending) => void;
  clearPending: () => void;
}

export const useOAuthStore = create<OAuthState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  clearPending: () => set({ pending: null }),
}));
