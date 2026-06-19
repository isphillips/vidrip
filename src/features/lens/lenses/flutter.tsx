import React from 'react';
import { Group, Path } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { sample } from './_meshKit';
import { WING, rnd, type Pt, type LensProps } from '../core';

const WCOL = ['#FF6FB5', '#7AA8FF', '#FFD166', '#9B5DE5', '#56E39F'];

// A butterfly resting on a mesh vertex, wings flapping + body gently bobbing.
function Butterfly({ p, size, color, base, clock }: { p: Pt; size: number; color: string; base: number; clock: SharedValue<number> }) {
  const flap = useDerivedValue(() => 0.35 + 0.65 * Math.abs(Math.sin(clock.value * 8 + base)));
  const bob = useDerivedValue(() => p.y + Math.sin(clock.value * 2 + base) * size * 0.18);
  const left = useDerivedValue(() => [{ translateX: p.x }, { translateY: bob.value }, { scaleX: -size * flap.value }, { scaleY: size }]);
  const right = useDerivedValue(() => [{ translateX: p.x }, { translateY: bob.value }, { scaleX: size * flap.value }, { scaleY: size }]);
  return (
    <Group>
      <Group transform={left}><Path path={WING} color={color} /></Group>
      <Group transform={right}><Path path={WING} color={color} /></Group>
    </Group>
  );
}

// Flutter: a kaleidoscope of butterflies alights on the face, wings beating.
export function Flutter({ f, clock }: LensProps) {
  if (!f.mesh) { return null; }
  const spots = sample(f.meshPts, 20);
  return (
    <Group>
      {spots.map((p, i) => (
        <Butterfly key={i} p={p} size={f.faceW * 0.09 * (0.7 + rnd(i))} color={WCOL[i % WCOL.length]} base={rnd(i, 2) * 6.283} clock={clock} />
      ))}
    </Group>
  );
}
