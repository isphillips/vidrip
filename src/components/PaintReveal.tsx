import React, { useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring, withSequence,
  interpolate, Extrapolation, Easing, type SharedValue,
} from 'react-native-reanimated';

// Brand paint colors (the drip pink→purple family).
const COLORS = ['#E73D93', '#C42BC3', '#A03FD0', '#FF2D8B', '#7B2FF0'];
const CLAMP = Extrapolation.CLAMP;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ── Drips: thin paint runs that streak down from the top edge ───────────────────
// A narrow run + a pooled cap where it emerges + an elongated teardrop at the tip.
// Each accelerates downward (gravity ease) with a gentle sway, on its own delay.
type Drip = { leftPct: number; w: number; h: number; color: string; delay: number; dur: number; sway: number };
const DRIPS: Drip[] = Array.from({ length: 18 }, () => ({
  leftPct: rand(0.03, 0.97),
  w: rand(3, 9),
  h: rand(70, 360),
  color: pick(COLORS),
  delay: rand(0, 520),
  dur: rand(900, 1700),
  sway: rand(-7, 7),
}));

// ── Splats: chaotic clusters like paint thrown at a wall ────────────────────────
// A ragged main blob + a scatter of droplets flung out around it. Each SMACKS in
// with an overshoot then springs to rest; the biggest ones throw a shockwave ring.
type Dot = { x: number; y: number; s: number };
type Splat = { leftPct: number; topPct: number; size: number; color: string; delay: number; rot: number; dots: Dot[]; ring: boolean };
const SPLATS: Splat[] = Array.from({ length: 22 }, () => {
  const size = rand(12, 70);
  return {
    leftPct: rand(0.04, 0.96),
    topPct: rand(0.06, 0.86),
    size,
    color: pick(COLORS),
    delay: rand(0, 950),
    rot: rand(-30, 30),
    ring: size > 42,
    dots: Array.from({ length: Math.floor(rand(4, 9)) }, () => ({
      x: rand(-size * 1.7, size * 1.7),
      y: rand(-size * 1.7, size * 1.7),
      s: rand(2, size * 0.42),
    })),
  };
});

function DripView({ d, W, active }: { d: Drip; W: number; active: boolean }) {
  const prog = useSharedValue(0);
  useEffect(() => {
    prog.value = active
      ? withDelay(d.delay, withTiming(1, { duration: d.dur, easing: Easing.in(Easing.quad) }))  // gravity accel
      : withTiming(0, { duration: 160 });
  }, [active, d, prog]);
  const a = useAnimatedStyle(() => ({
    height: interpolate(prog.value, [0, 1], [0, d.h], CLAMP),
    opacity: interpolate(prog.value, [0, 0.05], [0, 1], CLAMP),
    transform: [{ translateX: interpolate(prog.value, [0, 0.5, 1], [0, d.sway, 0], CLAMP) }],
  }));
  return (
    <Animated.View style={[styles.drip, { left: d.leftPct * W - d.w / 2, width: d.w, backgroundColor: d.color, borderRadius: d.w / 2 }, a]}>
      {/* Pooled paint where the run emerges from the top edge. */}
      <View style={{ position: 'absolute', top: -d.w * 0.5, left: -d.w * 0.6, width: d.w * 2.2, height: d.w * 1.5, borderRadius: d.w, backgroundColor: d.color }} />
      {/* Elongated teardrop at the dripping tip — pointed top, round bottom. */}
      <View style={{
        position: 'absolute', bottom: -d.w * 2, left: -d.w * 0.3, width: d.w * 1.6, height: d.w * 2.8,
        backgroundColor: d.color,
        borderTopLeftRadius: d.w * 0.5, borderTopRightRadius: d.w * 0.5,
        borderBottomLeftRadius: d.w * 1.4, borderBottomRightRadius: d.w * 1.4,
      }} />
    </Animated.View>
  );
}

function SplatView({ s, W, H, active }: { s: Splat; W: number; H: number; active: boolean }) {
  // SMACK: a quick overshoot then a bouncy spring to rest (paint hitting a wall, hard).
  const prog = useSharedValue(0);
  useEffect(() => {
    prog.value = active
      ? withDelay(s.delay, withSequence(
          withTiming(1.25, { duration: 90, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 6, stiffness: 200, mass: 0.6 }),
        ))
      : withTiming(0, { duration: 160 });
  }, [active, prog, s]);
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(prog.value, [0, 0.05], [0, 1], CLAMP),
    transform: [{ scale: prog.value }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', left: s.leftPct * W - s.size / 2, top: s.topPct * H - s.size / 2, width: s.size, height: s.size }, a]}>
      {/* Ragged, asymmetric main blob (rotated for an irregular silhouette). */}
      <View style={{
        width: '100%', height: '100%', backgroundColor: s.color, transform: [{ rotate: `${s.rot}deg` }],
        borderTopLeftRadius: s.size * 0.62, borderTopRightRadius: s.size * 0.38,
        borderBottomRightRadius: s.size * 0.7, borderBottomLeftRadius: s.size * 0.44,
      }} />
      {s.dots.map((dot, i) => (
        <View key={i} style={{ position: 'absolute', left: s.size / 2 + dot.x, top: s.size / 2 + dot.y, width: dot.s, height: dot.s, borderRadius: dot.s / 2, backgroundColor: s.color }} />
      ))}
    </Animated.View>
  );
}

// Expanding shockwave ring thrown off by a big splat's impact.
function Shockwave({ s, W, H, active }: { s: Splat; W: number; H: number; active: boolean }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = active
      ? withDelay(s.delay, withTiming(1, { duration: 540, easing: Easing.out(Easing.cubic) }))
      : withTiming(0, { duration: 100 });
  }, [active, r, s]);
  const D = s.size * 1.7;
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(r.value, [0, 0.12, 1], [0, 0.5, 0], CLAMP),
    transform: [{ scale: interpolate(r.value, [0, 1], [0.3, 3], CLAMP) }],
  }));
  return (
    <Animated.View style={[{
      position: 'absolute', left: s.leftPct * W - D / 2, top: s.topPct * H - D / 2,
      width: D, height: D, borderRadius: D / 2, borderWidth: 3, borderColor: s.color,
    }, a]} />
  );
}

// One big radial burst from center on reveal — the "drop" landing.
function CenterBurst({ W, H, active }: { W: number; H: number; active: boolean }) {
  const b = useSharedValue(0);
  useEffect(() => {
    b.value = active
      ? withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) })
      : withTiming(0, { duration: 120 });
  }, [active, b]);
  const D = Math.min(W, H) * 0.92;
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(b.value, [0, 0.15, 1], [0, 0.5, 0], CLAMP),
    transform: [{ scale: interpolate(b.value, [0, 1], [0.15, 2.4], CLAMP) }],
  }));
  const flash = useAnimatedStyle(() => ({
    opacity: interpolate(b.value, [0, 0.08, 0.4], [0, 0.28, 0], CLAMP),
  }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FF2D8B' }, flash]} />
      <Animated.View pointerEvents="none" style={[{
        position: 'absolute', left: W / 2 - D / 2, top: H / 2 - D / 2,
        width: D, height: D, borderRadius: D / 2, borderWidth: 6, borderColor: '#FF2D8B',
      }, ring]} />
    </>
  );
}

/**
 * Final-step reveal: a center burst lands, splats SMACK in with spring overshoots and
 * throw shockwave rings, and accelerating drips run from the top edge. Everything is its
 * own Reanimated spring/timing keyed off `active`. A separate gradient scrim (in the
 * onboarding screen) darkens the copy band for legibility. Decorative — pointerEvents none.
 */
export default function PaintReveal({ active }: { active: boolean }) {
  const { width, height } = useWindowDimensions();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <CenterBurst W={width} H={height} active={active} />
      {SPLATS.filter(s => s.ring).map((s, i) => <Shockwave key={`w${i}`} s={s} W={width} H={height} active={active} />)}
      {SPLATS.map((s, i) => <SplatView key={`s${i}`} s={s} W={width} H={height} active={active} />)}
      {DRIPS.map((d, i) => <DripView key={`d${i}`} d={d} W={width} active={active} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  drip: { position: 'absolute', top: 0 },
});
