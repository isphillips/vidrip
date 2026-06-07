import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const SEEN_KEY = 'vidrip_onboarded_v1';

/** First-run gate, persisted on-device. `ready` flips once AsyncStorage is read. */
export function useOnboarding() {
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState(true); // assume seen until proven otherwise (no flash)

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SEEN_KEY)
      .then(v => { if (alive) { setSeen(v === '1'); } })
      .catch(() => { /* treat as seen */ })
      .finally(() => { if (alive) { setReady(true); } });
    return () => { alive = false; };
  }, []);

  const complete = useCallback(async () => {
    setSeen(true);
    try { await AsyncStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
  }, []);

  return { ready, seen, complete };
}

/** Lets the Account screen re-launch the welcome flow on demand. */
interface OnboardingReplay {
  replaying: boolean;
  startReplay: () => void;
  endReplay: () => void;
}
export const useOnboardingStore = create<OnboardingReplay>((set) => ({
  replaying: false,
  startReplay: () => set({ replaying: true }),
  endReplay: () => set({ replaying: false }),
}));
