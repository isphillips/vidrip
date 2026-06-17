import React from 'react';
import { Group, Circle, RadialGradient, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { LensProps } from '../core';

// Huge eye: layered sclera shading, a multi-stop radial iris with a limbal ring, a pulsing pupil, a
// highlight, and a periodic blink — drawn over the real eye so it reads as a giant cartoon eye. Also
// serves as the static picker preview for the camera-warp "Mega Eyes" lens.
function CartoonEye({ cx, cy, r, clock, colors, phase }: {
  cx: number; cy: number; r: number; clock: SharedValue<number>; colors: string[]; phase: number;
}) {
  const blink = useDerivedValue(() => {
    const t = (clock.value + phase) % 3.6;
    if (t > 3.4) { return [{ scaleY: Math.max(0.08, Math.cos(((t - 3.4) / 0.2) * Math.PI) ** 2) }]; }
    return [{ scaleY: 1 }];
  });
  const lx = useDerivedValue(() => cx + Math.sin(clock.value * 0.8 + phase) * r * 0.16);
  const ly = useDerivedValue(() => cy + Math.cos(clock.value * 1.1 + phase) * r * 0.1);
  const pr = useDerivedValue(() => r * 0.24 * (1 + 0.14 * Math.sin(clock.value * 3 + phase)));
  const hx = useDerivedValue(() => lx.value - r * 0.18);
  const hy = useDerivedValue(() => ly.value - r * 0.18);
  return (
    <Group transform={blink} origin={vec(cx, cy)}>
      <Circle cx={cx} cy={cy} r={r} color="#ffffff" />
      <Circle cx={cx} cy={cy} r={r}>
        <RadialGradient c={vec(cx, cy - r * 0.3)} r={r} colors={['rgba(255,255,255,0)', 'rgba(170,190,225,0.45)']} />
      </Circle>
      <Circle cx={lx} cy={ly} r={r * 0.58}>
        <RadialGradient c={vec(cx, cy)} r={r * 0.58} colors={colors} />
      </Circle>
      <Circle cx={lx} cy={ly} r={r * 0.58} style="stroke" strokeWidth={r * 0.05} color="rgba(0,0,0,0.35)" />
      <Circle cx={lx} cy={ly} r={pr} color="#0b0b12" />
      <Circle cx={hx} cy={hy} r={r * 0.1} color="rgba(255,255,255,0.95)" />
      <Circle cx={cx} cy={cy} r={r} style="stroke" strokeWidth={Math.max(2, r * 0.06)} color="#15151c" />
    </Group>
  );
}

export function BigEyes({ f, clock }: LensProps) {
  const r = f.eyeDist * 0.92;
  return (
    <>
      <CartoonEye cx={f.le.x} cy={f.le.y} r={r} clock={clock} colors={['#9BF6FF', '#0A6CFF', '#04246B']} phase={0} />
      <CartoonEye cx={f.re.x} cy={f.re.y} r={r} clock={clock} colors={['#9BF6FF', '#0A6CFF', '#04246B']} phase={1.3} />
    </>
  );
}
