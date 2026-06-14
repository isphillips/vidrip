import { create } from 'zustand';

// Global profile drawer — any tappable @handle in the app calls open({...}) to slide
// up the user's profile, without needing navigation wiring at the call site.
type Target = { userId?: string; handle?: string };

interface ProfileDrawerState {
  target: Target | null;
  open: (t: Target) => void;
  close: () => void;
}

export const useProfileDrawer = create<ProfileDrawerState>((set) => ({
  target: null,
  open: (t) => set({ target: t }),
  close: () => set({ target: null }),
}));

/** Convenience for call sites: openProfile by user id (preferred) or handle. */
export const openProfile = (t: Target) => useProfileDrawer.getState().open(t);
