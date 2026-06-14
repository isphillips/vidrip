import { create } from 'zustand';

type State = {
  reactionId: string | null;
  open: (reactionId: string) => void;
  close: () => void;
};

// Drives the root-mounted ProfileReactionPlayer. Tapping a reaction tile in the
// profile drawer opens a signed, full-screen player over everything.
export const useProfileReactionPlayer = create<State>((set) => ({
  reactionId: null,
  open: (reactionId) => set({ reactionId }),
  close: () => set({ reactionId: null }),
}));

export const openReactionPlayer = (reactionId: string) =>
  useProfileReactionPlayer.getState().open(reactionId);
