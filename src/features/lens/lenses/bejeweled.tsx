import React from 'react';
import { Group, Path } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { sample } from './_meshKit';
import { CRYSTAL, rnd, type Pt, type LensProps } from '../core';

const GEMS = ['#FF3D7F', '#FFD23F', '#3DFFB0', '#3D9BFF', '#C13DFF', '#FF7A3D'];

// One faceted gem pinned to a mesh vertex, slowly turning + catching the light.
function Gem({ p, size, color, base, clock }: { p: Pt; size: number; color: string; base: number; clock: SharedValue<number> }) {
  const op = useDerivedValue(() => 0.6 + 0.4 * Math.abs(Math.sin(clock.value * 2 + base)));
  const tf = useDerivedValue(() => [{ translateX: p.x }, { translateY: p.y }, { rotate: base + clock.value * 0.3 }, { scale: size }]);
  return <Group opacity={op} transform={tf}><Path path={CRYSTAL} color={color} /></Group>;
}

// Bejeweled: the face encrusted with turning, twinkling jewels across the whole mesh.
export function Bejeweled({ f, clock }: LensProps) {
  if (!f.mesh) { return null; }
  const gems = sample(f.meshPts, 12);
  return (
    <Group>
      {gems.map((p, i) => (
        <Gem key={i} p={p} size={f.faceW * 0.05 * (0.6 + rnd(i))} color={GEMS[i % GEMS.length]} base={rnd(i, 2) * 6.283} clock={clock} />
      ))}
    </Group>
  );
}
