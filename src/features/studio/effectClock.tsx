import React, { createContext, useContext, useEffect } from 'react';
import {
  useSharedValue, useFrameCallback, runOnJS, type SharedValue,
} from 'react-native-reanimated';
import { reportFrameJank } from './studioQuality';

// ─── Shared, play-gated effect clock ──────────────────────────────────────────
//
// Every animated effect is a PURE FUNCTION of a single shared clock (seconds), instead of
// running its own `withRepeat` loop. This makes the whole effect layer:
//   • pausable / seekable — stop or scrub the clock and all effects freeze/follow in sync
//     with the video (the editor just keeps the clock running).
//   • deterministic — the same clock value always yields the same frame, so the share-bake
//     can step the clock frame-by-frame to render an exact copy quickly.

const ClockContext = createContext<SharedValue<number> | null>(null);

// Cap effect updates to ~60fps. useFrameCallback fires at the display refresh, so on a 120Hz
// phone (e.g. OnePlus) the clock — and therefore every dependent useAnimatedStyle + the Android
// RenderThread compositing ~100 particle Views — would run twice as often as needed. We accumulate
// the real elapsed time and only advance the clock on ~16ms boundaries, so animations stay
// time-accurate but high-refresh displays don't pay 2× the compositing cost.
const MIN_FRAME_MS = 15;
// A frame slower than this counts as "janky" (a dropped frame at 60fps). The fraction of janky
// frames over each ~1s window drives the adaptive quality tier (studioQuality).
const JANK_MS = 24;

/** Advances a shared clock (seconds) on the UI thread while `playing`, and samples frame jank to
 *  drive adaptive quality. Wrap any surface that renders effects so they share one clock. */
export function EffectClockProvider({
  playing = true, children,
}: { playing?: boolean; children: React.ReactNode }) {
  const clock = useSharedValue(0);
  const acc = useSharedValue(0);
  const winMs = useSharedValue(0);   // jank window: elapsed ms
  const winN = useSharedValue(0);    // frames in window
  const winJank = useSharedValue(0); // long frames in window
  const frame = useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame ?? 16.6;
    acc.value += dt;
    if (acc.value >= MIN_FRAME_MS) { clock.value += acc.value / 1000; acc.value = 0; }
    // Sample jank over ~1s windows → adaptive quality.
    winMs.value += dt; winN.value += 1;
    if (dt > JANK_MS) { winJank.value += 1; }
    if (winMs.value >= 1000) {
      runOnJS(reportFrameJank)(winN.value ? winJank.value / winN.value : 0);
      winMs.value = 0; winN.value = 0; winJank.value = 0;
    }
  }, false);
  useEffect(() => { frame.setActive(playing); }, [playing, frame]);
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>;
}

/** Provides an externally-owned clock (no auto-advance) — used by the share-bake, which steps
 *  the clock frame-by-frame to render a deterministic, exact copy of the effects. */
export function ControlledClockProvider({ clock, children }: { clock: SharedValue<number>; children: React.ReactNode }) {
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>;
}

/** The active clock. Falls back to a self-advancing local clock when there's no provider, so
 *  a lone effect render (e.g. a tray thumbnail) still animates. */
export function useClock(): SharedValue<number> {
  const ctx = useContext(ClockContext);
  const fallback = useSharedValue(0);
  const acc = useSharedValue(0);
  // Only the fallback drives itself; when a provider exists this callback stays inactive. Same
  // ~60fps cap as the provider clock.
  useFrameCallback((info) => {
    'worklet';
    acc.value += info.timeSincePreviousFrame ?? 16.6;
    if (acc.value >= MIN_FRAME_MS) { fallback.value += acc.value / 1000; acc.value = 0; }
  }, !ctx);
  return ctx ?? fallback;
}

// ─── Phase helpers (worklets) ─────────────────────────────────────────────────
// Map the monotonic clock (seconds) to a looping phase, replacing withRepeat/withTiming.

/** 0→1 sawtooth repeating every `durMs`, offset by `delayMs` (replaces withRepeat false). */
export function sawtooth(t: number, delayMs: number, durMs: number): number {
  'worklet';
  const x = (t * 1000 - delayMs) / durMs;
  return ((x % 1) + 1) % 1;
}

/** 0→1→0 triangle over `durMs` (replaces withRepeat yoyo / reverse=true). */
export function triangle(t: number, delayMs: number, durMs: number): number {
  'worklet';
  const s = sawtooth(t, delayMs, durMs);
  return s < 0.5 ? s * 2 : (1 - s) * 2;
}
