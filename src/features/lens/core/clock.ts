import { useEffect } from 'react';
import { useSharedValue, useFrameCallback, type SharedValue } from 'react-native-reanimated';

// ─── Animation clock ───────────────────────────────────────────────────────────
// A self-advancing seconds clock on the UI thread that the Skia lenses animate against (rotating
// gradients, pulsing glows, orbiting particles). Capped to ~30fps — plenty for the overlay and keeps
// GPU cost down while the camera + MediaPipe are already running. Inactive (held at 0) for the static
// picker previews so the grid doesn't run a frame loop per cell.
export function useLensClock(active: boolean): SharedValue<number> {
  const clock = useSharedValue(0);
  const acc = useSharedValue(0);
  const fc = useFrameCallback((info) => {
    'worklet';
    acc.value += info.timeSincePreviousFrame ?? 16.6;
    if (acc.value >= 32) { clock.value += acc.value / 1000; acc.value = 0; }
  }, false);
  useEffect(() => { fc.setActive(active); }, [active, fc]);
  return clock;
}
