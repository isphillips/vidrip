import { create } from 'zustand';

/**
 * Tiny bridge so the Browse (Share) tab button can tell ShareHomeScreen to return
 * to the browse view — even when the tab is already active (a plain tab tap on the
 * focused tab doesn't change navigation focus, so a focus effect can't catch it).
 * The tab's tabPress bumps `browseNonce`; ShareHomeScreen resets its mode on change.
 */
interface ShareUiState {
  browseNonce: number;
  requestBrowse: () => void;
}

export const useShareUiStore = create<ShareUiState>((set) => ({
  browseNonce: 0,
  requestBrowse: () => set(s => ({ browseNonce: s.browseNonce + 1 })),
}));
