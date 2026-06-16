import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { updateDraft, type StudioStage, type StudioDraft } from '../../infrastructure/storage/studioDraftStorage';

/**
 * Persists a studio draft's stage + edit settings as the user works. Focus-aware: only the
 * currently-visible screen writes — important because native-stack keeps earlier screens mounted,
 * so without this their intervals would keep overwriting the draft's stage. Saves on focus, every
 * few seconds while editing, and once more on blur/unmount — so progress survives a crash/close at
 * any point and "Save for later" (popToTop) flushes the latest state. No-op without a draftId.
 */
export function useStudioAutosave(
  draftId: string | undefined,
  stage: StudioStage,
  state: Partial<StudioDraft>,
): void {
  const stateRef = useRef(state);
  stateRef.current = state;

  useFocusEffect(
    useCallback(() => {
      if (!draftId) { return; }
      const save = () => updateDraft(draftId, { stage, ...stateRef.current });
      save();                              // record this stage as soon as the screen is shown
      const iv = setInterval(save, 4000);  // periodic safety save while editing
      return () => { clearInterval(iv); save(); }; // final flush when leaving the screen
    }, [draftId, stage]),
  );
}
