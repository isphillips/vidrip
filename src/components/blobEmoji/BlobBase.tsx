import React, { createContext, useContext, useEffect, useRef } from 'react';
import { Pressable, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useDerivedValue, withRepeat, withTiming, withSequence, withDelay,
  Easing, interpolate, type SharedValue,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';

// Blink driver shared with the eye primitives via context (so we don't thread it through all 10 blobs).
// 0 = eyes open, →1 = closed; the open-eye parts read this and squash their height when it spikes.
export const BlinkContext = createContext<SharedValue<number> | null>(null);

// "Static" mode (provided by context so we don't thread a prop through all 11 blob variants): skip the
// idle breathe/blink/action loops entirely. A Reanimated useAnimatedStyle only re-runs when a shared
// value it reads CHANGES — so with the loops never started, every blob worklet runs once and then costs
// nothing per frame. Used by the EmojiFountain, where dozens of blobs fly by too fast to read a breathe.
export const BlobStaticContext = createContext(false);

export type BlobAnim = { bob: SharedValue<number>; pop: SharedValue<number>; blink: SharedValue<number> };
export type BlobChildCtx = { w: number; h: number; anim: BlobAnim };

// The shared engine for our animated "blob emojis" — a squishy gradient body (same recipe as the
// nav slimes: RN Views + LinearGradient + Reanimated, no Skia) with two live shared values the faces
// read from: `bob` (idle 0..1 breathe loop) and `pop` (0→1→0 burst fired on tap). Each emoji composes
// this with its own face/extras via the render-prop child, and picks how `pop` deforms the body
// (`variant`) so a laugh shakes, a wow stretches tall, a celebrate spins, etc.

export type ExciteVariant = 'pop' | 'stretch' | 'shake' | 'spin' | 'jump';

export type BlobBaseProps = {
  size: number;
  /** Body gradient (top-left → bottom-right). */
  colors: string[];
  /** Corner radii as a fraction of body width. Default = rounded droplet. */
  radius?: { tl: number; tr: number; bl: number; br: number };
  /** Body height as a fraction of body width (1 = round-ish, >1 = tall like a flame). */
  tall?: number;
  /** How the tap burst deforms the body. */
  variant?: ExciteVariant;
  /** Draw a custom silhouette (heart / flame / popper) from `children` instead of the rounded body. */
  bare?: boolean;
  /** 0..1 phase offset so a row of blobs doesn't breathe in lockstep. */
  idlePhase?: number;
  /** When set, the blob is tappable: it plays its burst and then calls this. */
  onPress?: () => void;
  /** Fire the burst from a parent (without nesting touchables): bump this number to trigger. */
  excited?: number;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
  children: (ctx: BlobChildCtx) => React.ReactNode;
};

const DEFAULT_RADIUS = { tl: 0.5, tr: 0.5, bl: 0.42, br: 0.42 };
const IDLE_MS = 1500;

export default function BlobBase({
  size, colors, radius = DEFAULT_RADIUS, tall = 0.9, variant = 'pop', bare = false, idlePhase = 0,
  onPress, excited, hitSlop = 6, style, children,
}: BlobBaseProps) {
  const bob = useSharedValue(0);
  const pop = useSharedValue(0);
  const blink = useSharedValue(0);
  // `idle` plays the emoji's signature action on a gentle repeat (clap, laugh, flicker…); `pop` is the
  // stronger tap burst. The faces + body read the MAX of the two, so the action loops at rest and a tap
  // just overrides it with a full burst — no loop bookkeeping.
  const idle = useSharedValue(0);
  const drive = useDerivedValue(() => Math.max(idle.value, pop.value));
  // When true (e.g. inside the EmojiFountain), render a frozen rest pose: skip every idle loop so the
  // body/face worklets evaluate once and never tick again. Huge when many blobs are on screen at once.
  const staticMode = useContext(BlobStaticContext);

  useEffect(() => {
    // Skip the idle loop at tiny sizes (inline reaction tallies): the ±4% breathe is sub-pixel there,
    // so it's pure cost in dense lists. Tap-burst (pop) still works at every size. Static mode skips it
    // at every size (fountain particles).
    if (staticMode || size < 20) { return; }
    // Phase-offset so neighbouring blobs breathe out of sync; loops forever, auto-reversing.
    bob.value = withDelay(
      Math.round(idlePhase * IDLE_MS),
      withRepeat(withTiming(1, { duration: IDLE_MS, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
  }, [bob, idlePhase, size, staticMode]);

  useEffect(() => {
    if (staticMode || size < 20) { return; } // no perceptible blink on tiny inline / frozen blobs
    // A long open hold, then a quick close→open; phase-offset (and slightly varied) so a row of blobs
    // doesn't blink in unison. The open-eye parts read `blink` from context and squash their height.
    blink.value = withDelay(
      Math.round(800 + idlePhase * 2400),
      withRepeat(
        withSequence(
          withTiming(0, { duration: 2400 + Math.round(idlePhase * 900) }),
          withTiming(1, { duration: 85, easing: Easing.in(Easing.quad) }),
          withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [blink, idlePhase, size, staticMode]);

  useEffect(() => {
    if (staticMode || size < 20) { return; } // tiny inline / frozen blobs stay still
    // Perform the action (ramp 0→1), hold at the end-state to rest (particles have faded there), then
    // snap back and replay. Phase-offset so a row doesn't perform in unison.
    const ACTION = 900, REST = 1500;
    idle.value = withDelay(
      Math.round(idlePhase * (ACTION + REST)),
      withRepeat(
        withSequence(
          withTiming(1, { duration: ACTION, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: REST }),
          withTiming(0, { duration: 1 }),
        ),
        -1,
      ),
    );
  }, [idle, idlePhase, size, staticMode]);

  const burst = () => {
    pop.value = 0;
    pop.value = withSequence(
      withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 480, easing: Easing.inOut(Easing.quad) }),
    );
  };

  // Parent-driven burst: fire whenever `excited` changes (skip the initial mount).
  const firstExcite = useRef(true);
  useEffect(() => {
    if (firstExcite.current) { firstExcite.current = false; return; }
    burst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excited]);

  const bodyStyle = useAnimatedStyle(() => {
    const breathe = interpolate(bob.value, [0, 1], [1, 1.025]);
    const ty = interpolate(bob.value, [0, 1], [size * 0.01, -size * 0.02]);
    // Action drive = idle loop OR tap burst, whichever is stronger. End-states resolve to neutral so the
    // loop's rest/reset is seamless.
    const p = Math.max(idle.value, pop.value);
    let scale = 1, scaleY = 1, rot = 0, jumpY = 0;
    switch (variant) {
      case 'stretch':
        scale = interpolate(p, [0, 0.5, 1], [1, 1.06, 1.0]);
        scaleY = interpolate(p, [0, 0.5, 1], [1, 1.24, 1.0]);
        break;
      case 'shake':
        rot = Math.sin(p * Math.PI * 6) * 11;
        scale = interpolate(p, [0, 0.4, 1], [1, 1.14, 1.0]);
        break;
      case 'spin':
        rot = p * 360;
        scale = interpolate(p, [0, 0.5, 1], [1, 1.18, 1.0]);
        break;
      case 'jump':
        jumpY = interpolate(p, [0, 0.5, 1], [0, -size * 0.22, 0]);
        scale = interpolate(p, [0, 0.5, 1], [1, 1.12, 1.0]);
        break;
      default: // 'pop' — bouncy squash (heartbeat when looping)
        scale = interpolate(p, [0, 0.45, 1], [1, 1.3, 1.0]);
        scaleY = interpolate(p, [0, 0.45, 1], [1, 0.84, 1.0]);
    }
    return {
      transform: [
        { translateY: ty + jumpY },
        { rotate: `${rot}deg` },
        { scale: breathe * scale },
        { scaleY },
      ],
    };
  });

  const bodyW = bare ? size : size * 0.84;
  const bodyH = bare ? size : bodyW * tall;
  // Children read `pop` = the combined drive, so flourishes (hearts, confetti, clap, tears…) play on the
  // idle loop AND on tap with no per-blob changes.
  const ctx: BlobChildCtx = { w: bodyW, h: bodyH, anim: { bob, pop: drive, blink } };

  // `bare` blobs (heart / flame / popper) draw their own silhouette from `children`; everyone else gets
  // the standard rounded gradient body. Either way the Animated.View applies breathe/burst and the
  // BlinkContext is provided so eye parts can blink.
  const inner = bare ? (
    <View style={{ width: size, height: size }}>
      <BlinkContext.Provider value={blink}>{children(ctx)}</BlinkContext.Provider>
    </View>
  ) : (
    // The gradient is a BACKGROUND only (it clips its own children to the rounded corners),
    // and the face + flourishes ride in a sibling overlay that does NOT clip — so tears,
    // smoke and confetti can fly past the body circle instead of being masked off.
    <View style={{ width: bodyW, height: bodyH }}>
      <LinearGradient
        colors={colors}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{
          ...StyleSheet.absoluteFillObject,
          borderTopLeftRadius: bodyW * radius.tl,
          borderTopRightRadius: bodyW * radius.tr,
          borderBottomLeftRadius: bodyW * radius.bl,
          borderBottomRightRadius: bodyW * radius.br,
        }}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <BlinkContext.Provider value={blink}>{children(ctx)}</BlinkContext.Provider>
      </View>
    </View>
  );

  const body = (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      <Animated.View style={bodyStyle}>{inner}</Animated.View>
    </View>
  );

  if (!onPress) { return body; }
  return (
    <Pressable onPress={() => { burst(); onPress(); }} hitSlop={hitSlop}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
});
