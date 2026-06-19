import React from 'react';
import {
  Group, Circle, Path, LinearGradient, RadialGradient, BlurMask, vec,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { STAR4, FLAME } from './shapes';

// ─── Shared particle / art primitives ───────────────────────────────────────
// Small animated building blocks reused across multiple lenses. Each reads the shared clock and is
// pinned to face-relative coordinates the lens computes from its FaceFrame.

// A twinkling 4-point sparkle pinned to a face-relative point.
export function Sparkle({ x, y, size, base, speed, color, clock }: {
  x: number; y: number; size: number; base: number; speed: number; color: string; clock: SharedValue<number>;
}) {
  const op = useDerivedValue(() => 0.2 + 0.8 * Math.abs(Math.sin(clock.value * speed + base)));
  const tf = useDerivedValue(() => {
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(clock.value * speed + base));
    return [{ translateX: x }, { translateY: y }, { rotate: clock.value * 0.6 + base }, { scale: size * tw }];
  });
  return <Group transform={tf} opacity={op}><Path path={STAR4} color={color} /></Group>;
}

// A particle that loops along a direction (rising embers / falling snow / confetti) with sway + fade.
export function Drifter({ x0, y0, sway, travel, size, dur, base, color, clock, star = false }: {
  x0: number; y0: number; sway: number; travel: number; size: number; dur: number; base: number;
  color: string; clock: SharedValue<number>; star?: boolean;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const cx = useDerivedValue(() => x0 + Math.sin((v.value + base) * Math.PI * 2) * sway);
  const cy = useDerivedValue(() => y0 + v.value * travel);
  const op = useDerivedValue(() => { const t = v.value; return t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88; });
  const tf = useDerivedValue(() => [{ translateX: cx.value }, { translateY: cy.value }, { rotate: v.value * 6 + base }, { scale: size }]);
  return star
    ? <Group transform={tf} opacity={op}><Path path={STAR4} color={color} /></Group>
    : <Circle cx={cx} cy={cy} r={size} color={color} opacity={op}><BlurMask blur={2} style="solid" /></Circle>;
}

// Layered flame: a deep-red base body, an orange mid tongue, and a white-gold core — each flickering
// and licking sideways out of phase, over a soft warm base glow. Reads as a real, living fire rather
// than a flat teardrop. Shared by the Inferno crown and the Demon horns.
export function FlameStack({ x, y, size, roll, base, clock }: {
  x: number; y: number; size: number; roll: number; base: number; clock: SharedValue<number>;
}) {
  // Deep-red outer body — widest, slowest, with a lateral lick.
  const tfBase = useDerivedValue(() => {
    const flick = 0.85 + 0.28 * Math.sin(clock.value * 6 + base) + 0.1 * Math.sin(clock.value * 13 + base * 2);
    const lick = Math.sin(clock.value * 4 + base) * 0.14;
    return [{ translateX: x }, { translateY: y }, { rotate: roll + lick }, { scaleX: size * 1.06 * (0.95 + 0.07 * Math.sin(clock.value * 5 + base)) }, { scaleY: size * 1.04 * flick }];
  });
  // Orange mid tongue.
  const tfMid = useDerivedValue(() => {
    const flick = 0.82 + 0.3 * Math.sin(clock.value * 9 + base) + 0.12 * Math.sin(clock.value * 17 + base * 2);
    const lick = Math.sin(clock.value * 5.5 + base + 1) * 0.16;
    return [{ translateX: x }, { translateY: y - size * 0.06 }, { rotate: roll + lick }, { scaleX: size * 0.78 * (0.95 + 0.08 * Math.sin(clock.value * 7 + base)) }, { scaleY: size * 0.88 * flick }];
  });
  // White-gold core — tightest and brightest.
  const tfCore = useDerivedValue(() => {
    const flick = 0.8 + 0.3 * Math.sin(clock.value * 12 + base + 1);
    const lick = Math.sin(clock.value * 7 + base + 2) * 0.18;
    return [{ translateX: x }, { translateY: y - size * 0.14 }, { rotate: roll + lick }, { scaleX: size * 0.42 }, { scaleY: size * 0.6 * flick }];
  });
  const glowOp = useDerivedValue(() => 0.4 + 0.25 * Math.abs(Math.sin(clock.value * 8 + base)));
  return (
    <>
      <Circle cx={x} cy={y - size * 0.05} r={size * 0.6} opacity={glowOp}>
        <RadialGradient c={vec(x, y - size * 0.05)} r={size * 0.6} colors={['rgba(255,140,0,0.6)', 'rgba(200,30,0,0)']} />
        <BlurMask blur={size * 0.3} style="normal" />
      </Circle>
      <Group transform={tfBase}>
        <Path path={FLAME}><LinearGradient start={vec(0, 0.5)} end={vec(0, -0.5)} colors={['#FF6A00', '#E22A00', '#9E1200', 'rgba(120,8,0,0.05)']} /></Path>
      </Group>
      <Group transform={tfMid}>
        <Path path={FLAME}><LinearGradient start={vec(0, 0.5)} end={vec(0, -0.5)} colors={['#FFC83C', '#FF7A00', 'rgba(220,50,0,0.15)']} /></Path>
      </Group>
      <Group transform={tfCore}>
        <Path path={FLAME}><LinearGradient start={vec(0, 0.5)} end={vec(0, -0.5)} colors={['#FFFFFF', '#FFE89A', 'rgba(255,180,40,0.2)']} /></Path>
      </Group>
    </>
  );
}
