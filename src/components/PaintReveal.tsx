import React, { useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, interpolate, Extrapolation, Easing,
  type SharedValue,
} from 'react-native-reanimated';

// Brand paint colors (the drip pink→purple family).
const COLORS = ['#E73D93', '#C42BC3', '#A03FD0', '#FF2D8B', '#7B2FF0'];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ── Drips: thin paint runs that streak down from the top edge ───────────────────
// A narrow run + a pooled cap where it emerges + an elongated teardrop at the tip.
type Drip = { leftPct: number; w: number; h: number; color: string; start: number };
const DRIPS: Drip[] = Array.from({ length: 18 }, () => ({
  leftPct: rand(0.03, 0.97),
  w: rand(3, 9),
  h: rand(70, 360),
  color: pick(COLORS),
  start: rand(0, 0.28),
}));

// ── Splats: chaotic clusters like paint thrown at a wall ────────────────────────
// A ragged main blob + a scatter of droplets/specks flung out around it.
type Dot = { x: number; y: number; s: number };
type Splat = { leftPct: number; topPct: number; size: number; color: string; start: number; rot: number; dots: Dot[] };
const SPLATS: Splat[] = Array.from({ length: 20 }, () => {
  const size = rand(12, 66);
  return {
    leftPct: rand(0.04, 0.96),
    topPct: rand(0.06, 0.86),
    size,
    color: pick(COLORS),
    start: rand(0.1, 0.72),
    rot: rand(-30, 30),
    dots: Array.from({ length: Math.floor(rand(4, 9)) }, () => ({
      x: rand(-size * 1.7, size * 1.7),
      y: rand(-size * 1.7, size * 1.7),
      s: rand(2, size * 0.42),
    })),
  };
});

// ── Roller strokes: several dark DIAGONAL roller passes behind the text ─────────
// Overlapping translucent capsules, tilted on an angle, revealed with a scaleY grow
// from the top OR bottom (alternating) — so some paint downward, some upward. The
// overlap darkens the center for readability; rounded ends keep it from looking square.
// Each stroke owns its OWN animation: a sequential delay so they paint on one at a
// time (not all together), then a scaleY grow that lays the paint down.
type Stroke = { xFrac: number; wFrac: number; topFrac: number; hFrac: number; opacity: number; delay: number; dur: number; angle: number; dir: 1 | -1 };
const STROKES: Stroke[] = Array.from({ length: 6 }, (_, i) => ({
  xFrac: 0.1 + i * 0.145 + rand(-0.03, 0.03),
  wFrac: rand(0.15, 0.23),
  topFrac: 0.2 + rand(-0.02, 0.04),
  hFrac: rand(0.46, 0.6),
  opacity: rand(0.18, 0.27),
  delay: i * 360 + rand(0, 140),   // painted one after another
  dur: rand(620, 900),             // how long a single stroke takes to lay down
  angle: rand(16, 32) * (Math.random() < 0.5 ? 1 : -1),
  dir: i % 2 === 0 ? 1 : -1,       // alternate reveal: top→bottom vs bottom→top
}));

function StrokeView({ st, W, H, active }: { st: Stroke; W: number; H: number; active: boolean }) {
  const w = st.wFrac * W, h = st.hFrac * H;
  const prog = useSharedValue(0);
  useEffect(() => {
    prog.value = active
      ? withDelay(st.delay, withTiming(1, { duration: st.dur, easing: Easing.out(Easing.cubic) }))
      : withTiming(0, { duration: 150 });
  }, [active, prog, st]);
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(prog.value, [0, 0.08], [0, 1], Extrapolation.CLAMP),
    transform: [{ scaleY: prog.value }, { rotate: `${st.angle}deg` }],
  }));
  return (
    <Animated.View style={[{
      position: 'absolute', left: st.xFrac * W, top: st.topFrac * H, width: w, height: h,
      borderRadius: w * 0.5,   // capsule — rounded both ends, no flat/dark edge
      backgroundColor: `rgba(0,0,0,${st.opacity})`,
      transformOrigin: st.dir === 1 ? '50% 0%' : '50% 100%',
    }, a]} />
  );
}

function DripView({ d, p, W }: { d: Drip; p: SharedValue<number>; W: number }) {
  // Slow run: grows over most of the progress with a decelerating ease.
  const a = useAnimatedStyle(() => ({
    height: interpolate(p.value, [d.start, d.start + 0.66], [0, d.h], Extrapolation.CLAMP),
    opacity: interpolate(p.value, [d.start, d.start + 0.05], [0, 1], Extrapolation.CLAMP),
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

function SplatView({ s, p, W, H }: { s: Splat; p: SharedValue<number>; W: number; H: number }) {
  // Subtle, near-instant appearance (no bouncy overshoot) — like paint hitting a wall.
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [s.start, s.start + 0.05], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(p.value, [s.start, s.start + 0.12], [0.65, 1], Extrapolation.CLAMP) }],
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

/**
 * Final-step reveal: slow paint runs drip from the top while chaotic splatter
 * bursts across the wall. Motion is gentle; the paint shapes carry the energy.
 * Decorative — sits behind content (pointerEvents none).
 */
export default function PaintReveal({ active }: { active: boolean }) {
  const { width, height } = useWindowDimensions();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = active
      ? withTiming(1, { duration: 3200, easing: Easing.out(Easing.cubic) })   // slower
      : withTiming(0, { duration: 220 });
  }, [active, p]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {SPLATS.map((s, i) => <SplatView key={`s${i}`} s={s} p={p} W={width} H={height} />)}
      {STROKES.map((st, i) => <StrokeView key={`r${i}`} st={st} W={width} H={height} active={active} />)}
      {DRIPS.map((d, i) => <DripView key={`d${i}`} d={d} p={p} W={width} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  drip: { position: 'absolute', top: 0 },
});
