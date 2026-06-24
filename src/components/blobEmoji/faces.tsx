/* eslint-disable react-native/no-inline-styles */
import React, { useContext, useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withRepeat, withTiming, withDelay, Easing, interpolate, type SharedValue,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { BlinkContext } from './BlobBase';

// Reusable face parts + animated flourishes for the blob emojis. Static parts take absolute pixel
// centres (the blob computes them from its body w/h). Flourishes read the `pop` burst (0→1→0) — or
// the idle `bob` — so the expression comes alive on tap. Everything is plain Views + Reanimated.

export const INK = '#3A1526';        // warm-dark feature ink — reads on bright blobs
const TEAR = '#9BD9FF';

// ── Eyes (blink-aware via BlinkContext) ─────────────────────────────────────────
export function RoundEye({ cx, cy, d, ink = INK, shine = true }: { cx: number; cy: number; d: number; ink?: string; shine?: boolean }) {
  const blink = useContext(BlinkContext);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleY: blink ? 1 - blink.value * 0.85 : 1 }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: cx - d / 2, top: cy - d / 2, width: d, height: d, borderRadius: d / 2, backgroundColor: ink }, st]}>
      {shine && <View style={{ position: 'absolute', left: d * 0.2, top: d * 0.16, width: d * 0.32, height: d * 0.32, borderRadius: d * 0.16, backgroundColor: 'rgba(255,255,255,0.9)' }} />}
    </Animated.View>
  );
}

// Heart-shaped eyes (😍) — a bright heart over a larger dark one so it reads with a crisp outline
// (plain red hearts vanish on a pink body). Blinks like a normal eye, and `grow` (the action drive)
// swells them as the blob emotes.
export function HeartEye({ cx, cy, size, color = '#FF2D55', outline = '#4A0818', grow }: { cx: number; cy: number; size: number; color?: string; outline?: string; grow?: SharedValue<number> }) {
  const blink = useContext(BlinkContext);
  const st = useAnimatedStyle(() => ({
    transform: [
      { scale: grow ? 1 + grow.value * 0.58 : 1 },
      { scaleY: blink ? 1 - blink.value * 0.85 : 1 },
    ],
  }));
  const inset = size * 0.11; // keeps the two hearts concentric → even dark rim
  return (
    <Animated.View style={[{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size }, st]} pointerEvents="none">
      <Ionicons name="heart" size={size} color={outline} style={{ position: 'absolute', left: 0, top: 0 }} />
      <Ionicons name="heart" size={size * 0.78} color={color} style={{ position: 'absolute', left: inset, top: inset }} />
    </Animated.View>
  );
}

// An arc cap — dir 'up' = ∩ (closed laughing eye / frown), 'down' = ‿ (smile / smiling eye).
export function Arc({ cx, cy, w, h, thick, ink = INK, dir }: { cx: number; cy: number; w: number; h: number; thick: number; ink?: string; dir: 'up' | 'down' }) {
  const s: ViewStyle = { position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, borderColor: ink };
  if (dir === 'up') { s.borderTopWidth = thick; s.borderTopLeftRadius = w / 2; s.borderTopRightRadius = w / 2; }
  else { s.borderBottomWidth = thick; s.borderBottomLeftRadius = w / 2; s.borderBottomRightRadius = w / 2; }
  return <View style={s} />;
}

// A filled open mouth (laugh / wow), optionally with a tongue.
export function OpenMouth({ cx, cy, w, h, ink = INK, tongue = false }: { cx: number; cy: number; w: number; h: number; ink?: string; tongue?: boolean }) {
  return (
    <View style={{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, borderRadius: Math.min(w, h) / 2, backgroundColor: ink, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' }}>
      {tongue && <View style={{ width: w * 0.52, height: h * 0.5, borderTopLeftRadius: w * 0.26, borderTopRightRadius: w * 0.26, backgroundColor: '#FF6B8A', marginBottom: -h * 0.08 }} />}
    </View>
  );
}

// An angled brow bar.
export function Brow({ cx, cy, w, thick, rot, ink = INK }: { cx: number; cy: number; w: number; thick: number; rot: number; ink?: string }) {
  return <View style={{ position: 'absolute', left: cx - w / 2, top: cy - thick / 2, width: w, height: thick, borderRadius: thick / 2, backgroundColor: ink, transform: [{ rotate: `${rot}deg` }] }} />;
}

// A static teardrop (pointed top, round bottom).
export function Tear({ cx, cy, w, color = TEAR }: { cx: number; cy: number; w: number; color?: string }) {
  const h = w * 1.35;
  return <View style={{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, backgroundColor: color, borderTopLeftRadius: w * 0.32, borderTopRightRadius: w * 0.32, borderBottomLeftRadius: w * 0.5, borderBottomRightRadius: w * 0.5 }} />;
}

// ── Animated flourishes (read the `pop` burst) ─────────────────────────────────
export function FloatHeart({ pop, cx, cy, size, color = '#FF3D6E', delay = 0 }: { pop: SharedValue<number>; cx: number; cy: number; size: number; color?: string; delay?: number }) {
  const st = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (pop.value - delay) / (1 - delay || 1)));
    return {
      opacity: interpolate(p, [0, 0.15, 1], [0, 1, 0]),
      transform: [
        { translateX: Math.sin(p * Math.PI * 2) * size * 0.4 },
        { translateY: -p * size * 2.4 },
        { scale: interpolate(p, [0, 0.2, 1], [0.2, 1, 0.7]) },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: cx - size / 2, top: cy - size / 2 }, st]} pointerEvents="none">
      <Ionicons name="heart" size={size} color={color} />
    </Animated.View>
  );
}

export function Confetti({ pop, cx, cy, angle, dist, size, color }: { pop: SharedValue<number>; cx: number; cy: number; angle: number; dist: number; size: number; color: string }) {
  const st = useAnimatedStyle(() => {
    const p = pop.value;
    return {
      opacity: interpolate(p, [0, 0.1, 1], [0, 1, 0]),
      transform: [
        { translateX: Math.cos(angle) * dist * p },
        { translateY: Math.sin(angle) * dist * p },
        { rotate: `${p * 220}deg` },
        { scale: interpolate(p, [0, 0.3, 1], [0.2, 1, 0.5]) },
      ],
    };
  });
  return <Animated.View style={[{ position: 'absolute', left: cx - size / 2, top: cy - size * 0.3, width: size, height: size * 0.6, borderRadius: size * 0.15, backgroundColor: color }, st]} pointerEvents="none" />;
}

export function Sparkle({ pop, cx, cy, size, color = '#FFE08A', delay = 0 }: { pop: SharedValue<number>; cx: number; cy: number; size: number; color?: string; delay?: number }) {
  const st = useAnimatedStyle(() => {
    const p = Math.max(0, (pop.value - delay) / (1 - delay || 1));
    return { opacity: interpolate(p, [0, 0.2, 1], [0, 1, 0]), transform: [{ scale: interpolate(p, [0, 0.4, 1], [0, 1.1, 0]) }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: cx - size / 2, top: cy - size / 2 }, st]} pointerEvents="none">
      <Ionicons name="sparkles" size={size} color={color} />
    </Animated.View>
  );
}

export function Steam({ pop, cx, cy, size, dir }: { pop: SharedValue<number>; cx: number; cy: number; size: number; dir: number }) {
  const st = useAnimatedStyle(() => {
    const p = pop.value;
    return {
      opacity: interpolate(p, [0, 0.2, 1], [0, 0.85, 0]),
      transform: [{ translateX: dir * p * size * 0.7 }, { translateY: -p * size * 1.6 }, { scale: interpolate(p, [0, 0.3, 1], [0.4, 1, 1.4]) }],
    };
  });
  return <Animated.View style={[{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(225,225,235,0.9)' }, st]} pointerEvents="none" />;
}

// A soft puff that rises, wafts side-to-side and billows out as it climbs, then fades — on its own
// loop (independent of the action). Chain a few with staggered `phase`s for a continuous smoke/steam
// stream. `rise` = how far up it drifts (px); `drift` = max horizontal waft (px).
export function SmokeWisp({ cx, cy, w, rise, drift = 0, phase = 0, color = 'rgba(150,150,160,0.5)' }: { cx: number; cy: number; w: number; rise: number; drift?: number; phase?: number; color?: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(Math.round(phase * 1700), withRepeat(withTiming(1, { duration: 1700, easing: Easing.out(Easing.quad) }), -1, false));
  }, [t, phase]);
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.18, 0.7, 1], [0, 0.7, 0.4, 0]),
    transform: [
      { translateY: -t.value * rise },
      { translateX: drift * Math.sin(t.value * Math.PI * 2) },
      { scale: interpolate(t.value, [0, 1], [0.45, 1.7]) },
    ],
  }));
  return <Animated.View style={[{ position: 'absolute', left: cx - w / 2, top: cy - w / 2, width: w, height: w, borderRadius: w / 2, backgroundColor: color }, st]} pointerEvents="none" />;
}

// A streaming tear: rests under the eye, then gushes down + stretches on pop.
export function CryTear({ pop, cx, cy, w, color = TEAR }: { pop: SharedValue<number>; cx: number; cy: number; w: number; color?: string }) {
  const h = w * 1.5;
  const st = useAnimatedStyle(() => {
    const p = pop.value;
    return { transform: [{ translateY: p * h * 1.4 }, { scaleY: interpolate(p, [0, 0.5, 1], [1, 1.5, 1]) }], opacity: interpolate(p, [0, 0.1, 0.85, 1], [0.9, 1, 1, 0.5]) };
  });
  return <Animated.View style={[{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, backgroundColor: color, borderTopLeftRadius: w * 0.32, borderTopRightRadius: w * 0.32, borderBottomLeftRadius: w * 0.5, borderBottomRightRadius: w * 0.5 }, st]} pointerEvents="none" />;
}

// A small round nub-hand (like the Feed nav slime's hands): rests just off the blob's side, then
// sweeps in to meet its partner at centre — clapping twice per burst, popping a little on impact.
// `side` -1 = left hand, +1 = right. `bw`/`bh` are the blob body size; `d` is the hand diameter.
export function ClapHand({ pop, bw, bh, side, d, color = '#B98CFF' }: { pop: SharedValue<number>; bw: number; bh: number; side: number; d: number; color?: string }) {
  const restCx = bw * 0.5 + side * bw * 0.4;    // resting on the side
  const clapCx = bw * 0.5 + side * d * 0.46;    // hands touch at centre
  const partCx = (restCx + clapCx) / 2;         // half-open between the two claps
  const cy = bh * 0.6;
  const st = useAnimatedStyle(() => {
    const x = interpolate(pop.value, [0, 0.22, 0.42, 0.62, 1], [restCx, clapCx, partCx, clapCx, restCx]);
    const popK = interpolate(pop.value, [0.18, 0.22, 0.28, 0.58, 0.62, 0.68], [1, 1.18, 1, 1, 1.18, 1], 'clamp'); // impact squish
    return { transform: [{ translateX: x - restCx }, { scale: popK }] };
  });
  return (
    <Animated.View
      style={[{
        position: 'absolute', left: restCx - d / 2, top: cy - d / 2, width: d, height: d, borderRadius: d / 2,
        backgroundColor: color, borderWidth: Math.max(1.5, d * 0.11), borderColor: '#33135E',
      }, st]}
      pointerEvents="none">
      {/* gummy highlight */}
      <View style={{ position: 'absolute', top: d * 0.16, left: d * 0.18, width: d * 0.3, height: d * 0.3, borderRadius: d * 0.15, backgroundColor: 'rgba(255,255,255,0.55)' }} />
    </Animated.View>
  );
}

// A tear that streams continuously (its own loop, independent of the action) — for non-stop crying.
export function StreamTear({ cx, cy, w, fall, phase = 0, color = TEAR }: { cx: number; cy: number; w: number; fall: number; phase?: number; color?: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(Math.round(phase * 1100), withRepeat(withTiming(1, { duration: 1100, easing: Easing.in(Easing.quad) }), -1, false));
  }, [t, phase]);
  const h = w * 1.4;
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.12, 0.85, 1], [0, 1, 1, 0]),
    transform: [{ translateY: t.value * fall }, { scale: interpolate(t.value, [0, 0.2, 1], [0.55, 1, 0.85]) }],
  }));
  return <Animated.View style={[{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, backgroundColor: color, borderTopLeftRadius: w * 0.32, borderTopRightRadius: w * 0.32, borderBottomLeftRadius: w * 0.5, borderBottomRightRadius: w * 0.5 }, st]} pointerEvents="none" />;
}

// A tear that splashes outward (and arcs down) on the action drive — for laughing-so-hard tears.
export function SplashTear({ pop, cx, cy, w, dir, delay = 0, color = TEAR }: { pop: SharedValue<number>; cx: number; cy: number; w: number; dir: number; delay?: number; color?: string }) {
  const h = w * 1.4;
  const st = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (pop.value - delay) / Math.max(0.0001, 1 - delay)));
    return {
      opacity: interpolate(p, [0, 0.12, 0.78, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: dir * p * w * 3.6 },                 // fling well outward
        { translateY: -p * w * 1.8 + p * p * w * 3.8 },    // pop up, then arc down past the start
        { rotate: `${dir * p * 55}deg` },
        { scale: interpolate(p, [0, 0.22, 1], [0.5, 1.4, 0.85]) },
      ],
    };
  });
  return <Animated.View style={[{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, backgroundColor: color, borderTopLeftRadius: w * 0.32, borderTopRightRadius: w * 0.32, borderBottomLeftRadius: w * 0.5, borderBottomRightRadius: w * 0.5 }, st]} pointerEvents="none" />;
}

// A thumbs-up fist; the thumb pushes up on pop.
export function ThumbsUpHand({ pop, cx, cy, s, color = '#FFD2A6' }: { pop: SharedValue<number>; cx: number; cy: number; s: number; color?: string }) {
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateY: -pop.value * s * 0.32 }] }));
  return (
    <View style={{ position: 'absolute', left: cx - s / 2, top: cy - s / 2, width: s, height: s }} pointerEvents="none">
      <View style={{ position: 'absolute', bottom: 0, left: s * 0.12, width: s * 0.76, height: s * 0.58, borderRadius: s * 0.18, backgroundColor: color, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }} />
      <Animated.View style={[{ position: 'absolute', top: 0, left: s * 0.14, width: s * 0.28, height: s * 0.56, borderRadius: s * 0.14, backgroundColor: color, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }, thumb]} />
    </View>
  );
}

// A flame tongue that flickers with the idle bob.
export function FlameTip({ bob, cx, cy, w, h, color, phase = 0 }: { bob: SharedValue<number>; cx: number; cy: number; w: number; h: number; color: string; phase?: number }) {
  const st = useAnimatedStyle(() => {
    const f = Math.sin((bob.value + phase) * Math.PI * 2);
    return { transform: [{ scaleY: 1 + f * 0.16 }, { translateY: -Math.abs(f) * h * 0.12 }] };
  });
  return <Animated.View style={[{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, backgroundColor: color, borderTopLeftRadius: w * 0.5, borderTopRightRadius: w * 0.5, borderBottomLeftRadius: w * 0.42, borderBottomRightRadius: w * 0.42 }, st]} pointerEvents="none" />;
}
