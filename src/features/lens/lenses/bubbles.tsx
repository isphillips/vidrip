import React from 'react';
import { Group, Circle, RadialGradient, SweepGradient, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, ScreenTint, WorldVignette, GodRays, Motes, type LensProps } from '../core';

// A single soap bubble: a near-transparent body with an iridescent rim sheen and a bright highlight,
// drifting upward with a little sway, on a loop.
function Bubble({ x0, y0, sway, travel, r, dur, base, clock }: {
  x0: number; y0: number; sway: number; travel: number; r: number; dur: number; base: number; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  // Translate the whole bubble via a Group so its gradients (anchored at local 0,0) ride along.
  const tf = useDerivedValue(() => [
    { translateX: x0 + Math.sin((v.value + base) * Math.PI * 2) * sway },
    { translateY: y0 - v.value * travel },
  ]);
  const op = useDerivedValue(() => { const t = v.value; return (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9) * 0.9; });
  const spin = useDerivedValue(() => [{ rotate: clock.value * 0.8 + base }]);
  return (
    <Group transform={tf} opacity={op}>
      <Circle cx={0} cy={0} r={r}>
        <RadialGradient c={vec(0, 0)} r={r} colors={['rgba(255,255,255,0.02)', 'rgba(180,220,255,0.12)', 'rgba(255,255,255,0.5)']} />
      </Circle>
      <Group origin={vec(0, 0)} transform={spin}>
        <Circle cx={0} cy={0} r={r} style="stroke" strokeWidth={r * 0.08}>
          <SweepGradient c={vec(0, 0)} colors={['#FF8AD8', '#9AE0FF', '#C7FFD8', '#FFF6A0', '#FF8AD8']} />
        </Circle>
      </Group>
      <Circle cx={-r * 0.32} cy={-r * 0.32} r={r * 0.16} color="rgba(255,255,255,0.95)" />
    </Group>
  );
}

// Underwater world: sunlight shafts from the surface, a deep teal depth vignette, drifting plankton,
// and iridescent soap bubbles rising past the face.
export function Bubbles({ f, clock, w, h }: LensProps) {
  return (
    <>
      {/* deep-water colour grade + depth vignette (keeps the face clear in the middle) */}
      <ScreenTint w={w} h={h} colors={['#1FA3C7', '#0A4E78', '#03263F']} opacity={0.38} />
      <WorldVignette w={w} h={h} colors={['rgba(8,80,120,0)', 'rgba(5,50,85,0.35)', 'rgba(2,22,40,0.7)']} />
      {/* god rays from the surface */}
      <GodRays w={w} h={h} x={w * 0.5} y={-h * 0.08} color="rgba(180,240,255,0.5)" count={6} spread={1.1} clock={clock} opacity={0.45} />
      {/* plankton / suspended particles drifting up */}
      <Motes w={w} h={h} count={26} color="rgba(200,245,255,0.8)" clock={clock} dir={-1} sizeMin={1} sizeMax={3.5} seed={3} />
      {Array.from({ length: 16 }).map((_, i) => {
        const start = off(f, f.eyeMid, -f.faceW * 0.5, (rnd(i) - 0.5) * f.faceW * 2.2);
        return (
          <Bubble key={i} x0={start.x} y0={start.y}
            sway={f.faceW * (0.1 + rnd(i, 2) * 0.12)} travel={f.faceW * (1.4 + rnd(i, 3) * 0.8)}
            r={f.faceW * (0.06 + rnd(i, 4) * 0.12)} dur={2.6 + rnd(i, 5) * 2.4} base={rnd(i, 6)} clock={clock} />
        );
      })}
    </>
  );
}
