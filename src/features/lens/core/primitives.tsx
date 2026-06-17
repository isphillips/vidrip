import React from 'react';
import {
  Group, Circle, Path, LinearGradient, BlurMask, vec,
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

// Layered flame: outer red→orange body + a brighter inner core, both flickering out of phase. Shared
// by the Inferno crown and the Demon horns.
export function FlameStack({ x, y, size, roll, base, clock }: {
  x: number; y: number; size: number; roll: number; base: number; clock: SharedValue<number>;
}) {
  const tfOuter = useDerivedValue(() => {
    const flick = 0.8 + 0.3 * Math.sin(clock.value * 9 + base) + 0.12 * Math.sin(clock.value * 17 + base * 2);
    const sway = Math.sin(clock.value * 5 + base) * 0.12;
    return [{ translateX: x }, { translateY: y }, { rotate: roll + sway }, { scaleX: size * (0.95 + 0.08 * Math.sin(clock.value * 7 + base)) }, { scaleY: size * flick }];
  });
  const tfInner = useDerivedValue(() => {
    const flick = 0.8 + 0.3 * Math.sin(clock.value * 11 + base + 1);
    return [{ translateX: x }, { translateY: y - size * 0.12 }, { rotate: roll }, { scaleX: size * 0.55 }, { scaleY: size * 0.62 * flick }];
  });
  return (
    <>
      <Group transform={tfOuter}>
        <Path path={FLAME}><LinearGradient start={vec(0, 0.5)} end={vec(0, -0.5)} colors={['#FFB000', '#FF5A00', '#C81E00', 'rgba(200,30,0,0.1)']} /></Path>
      </Group>
      <Group transform={tfInner}>
        <Path path={FLAME}><LinearGradient start={vec(0, 0.5)} end={vec(0, -0.5)} colors={['#FFF7C0', '#FFD000', 'rgba(255,150,0,0.2)']} /></Path>
      </Group>
    </>
  );
}
