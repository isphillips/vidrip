import React, { createContext, useContext, useEffect } from 'react';
import {
  useSharedValue, useFrameCallback, type SharedValue,
} from 'react-native-reanimated';

// ─── Shared, play-gated effect clock ──────────────────────────────────────────
//
// Every animated effect is a PURE FUNCTION of a single shared clock (seconds), instead of
// running its own `withRepeat` loop. This makes the whole effect layer:
//   • pausable / seekable — stop or scrub the clock and all effects freeze/follow in sync
//     with the video (the editor just keeps the clock running).
//   • deterministic — the same clock value always yields the same frame, so the share-bake
//     can step the clock frame-by-frame to render an exact copy quickly.

const ClockContext = createContext<SharedValue<number> | null>(null);

/** Advances a shared clock (seconds) on the UI thread while `playing`. Wrap any surface that
 *  renders effects (editor layer, sticker tray, EffectPlayer) so they share one clock. */
export function EffectClockProvider({
  playing = true, children,
}: { playing?: boolean; children: React.ReactNode }) {
  const clock = useSharedValue(0);
  const frame = useFrameCallback((info) => {
    'worklet';
    clock.value += (info.timeSincePreviousFrame ?? 16.6) / 1000;
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
  // Only the fallback drives itself; when a provider exists this callback stays inactive.
  useFrameCallback((info) => {
    'worklet';
    fallback.value += (info.timeSincePreviousFrame ?? 16.6) / 1000;
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
