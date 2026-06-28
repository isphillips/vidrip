import { create } from 'zustand';

// Global friends menu (the header drip-blob dropdown). The header icon (FriendsMenu) calls openMenu()
// to pop the menu over everything via FriendsMenuOverlay — mounted once at the root. We deliberately
// do NOT use an RN <Modal>: on the New Architecture (Fabric) the Modal opens a window but its content
// fails to render on Android, so the menu was invisible. An in-tree overlay renders reliably.
interface FriendsMenuState {
  open: boolean;
  count: number;            // pending friend-request count (drives the badge + the menu's first row)
  openMenu: () => void;
  close: () => void;
  setCount: (n: number) => void;
}

export const useFriendsMenu = create<FriendsMenuState>((set) => ({
  open: false,
  count: 0,
  openMenu: () => set({ open: true }),
  close: () => set({ open: false }),
  setCount: (count) => set({ count }),
}));
