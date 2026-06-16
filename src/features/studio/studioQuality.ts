import { create } from 'zustand';

// Adaptive render-quality tier, driven by measured frame jank (see effectClock's provider). Heavy
// particle effects multiply their particle counts by this, so a struggling device sheds particles
// and a capable one keeps full fidelity — self-tuning across the whole device range instead of a
// fixed cut. 1 = full, stepping down to MIN_Q.

type QualityState = { quality: number; set: (q: number) => void };

export const useStudioQuality = create<QualityState>((set) => ({
  quality: 1,
  set: (q) => set((s) => (Math.abs(s.quality - q) < 0.01 ? s : { quality: q })),
}));

const STEP = 0.34;   // tiers: 1.0 → 0.66 → 0.5
const MIN_Q = 0.5;
let smoothStreak = 0;

/**
 * Called ~1×/sec with the fraction of frames in the last second that ran long (>~24ms, i.e. a
 * dropped frame on either 60 or 120Hz). Steps quality DOWN fast on jank, UP slowly only after
 * several smooth seconds — asymmetric so it biases toward a smooth experience and doesn't flap.
 */
export function reportFrameJank(jankRatio: number): void {
  const { quality, set } = useStudioQuality.getState();
  if (jankRatio > 0.2) {
    smoothStreak = 0;
    if (quality > MIN_Q) { set(Math.max(MIN_Q, +(quality - STEP).toFixed(2))); }
  } else if (jankRatio < 0.05) {
    smoothStreak += 1;
    if (smoothStreak >= 5 && quality < 1) { smoothStreak = 0; set(Math.min(1, +(quality + STEP).toFixed(2))); }
  } else {
    smoothStreak = 0;
  }
}

/** Scale a full particle count by the current quality, keeping a sane minimum. */
export function scaleCount(full: number, quality: number): number {
  return Math.max(3, Math.round(full * quality));
}
