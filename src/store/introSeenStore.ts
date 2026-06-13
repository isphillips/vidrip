import { create } from 'zustand';

/**
 * Tracks which threads' intro pre-rolls have already been shown this app
 * session, so the reaction-watch screen plays the intro only ONCE per viewing
 * session per thread. Auto-advancing between sibling reactions does
 * `navigation.replace('WatchReaction', …)`, which remounts the screen — a
 * component-local flag wouldn't survive that, hence a shared (in-memory,
 * non-persisted) store keyed by threadId.
 */
interface IntroSeenState {
  seen: Set<string>;
  markSeen: (threadId: string) => void;
  hasSeen: (threadId: string) => boolean;
}

export const useIntroSeenStore = create<IntroSeenState>((set, get) => ({
  seen: new Set<string>(),
  markSeen: (threadId) =>
    set(s => (s.seen.has(threadId) ? s : { seen: new Set(s.seen).add(threadId) })),
  hasSeen: (threadId) => get().seen.has(threadId),
}));
