import React from 'react';
import { Group, Path } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { sample } from './_meshKit';
import { PETAL, rnd, type Pt, type LensProps } from '../core';

const PASTEL = ['#FF9EC4', '#FFC8DD', '#C8B6FF', '#BDE0FE', '#FFD6A5'];

// A 5-petal flower pinned to a mesh vertex, breathing + slowly turning.
function Flower({ p, size, color, base, clock }: { p: Pt; size: number; color: string; base: number; clock: SharedValue<number> }) {
  const tf = useDerivedValue(() => [
    { translateX: p.x }, { translateY: p.y }, { rotate: base + clock.value * 0.3 },
    { scale: size * (0.85 + 0.15 * Math.sin(clock.value * 2 + base)) },
  ]);
  return (
    <Group transform={tf}>
      {[0, 1, 2, 3, 4].map((k) => (
        <Group key={k} transform={[{ rotate: k * 1.2566 }]}>
          <Group transform={[{ translateY: -0.5 }]}><Path path={PETAL} color={color} /></Group>
        </Group>
      ))}
    </Group>
  );
}

// Bloom: flowers blossom across the face, pastel petals breathing open and shut.
export function Bloom({ f, clock }: LensProps) {
  if (!f.mesh) { return null; }
  const spots = sample(f.meshPts, 16);
  return (
    <Group>
      {spots.map((p, i) => (
        <Flower key={i} p={p} size={f.faceW * 0.07 * (0.7 + rnd(i))} color={PASTEL[i % PASTEL.length]} base={rnd(i, 2) * 6.283} clock={clock} />
      ))}
    </Group>
  );
}
