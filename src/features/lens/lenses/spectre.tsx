import React from 'react';
import { Group, Path, BlurMask } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { MeshWire, sample } from './_meshKit';
import { GHOST, ScreenTint, rnd, type Pt, type LensProps } from '../core';

// A little ghost that peels off the mesh and rises, fading as it goes.
function Wisp({ p, size, dur, base, clock }: { p: Pt; size: number; dur: number; base: number; clock: SharedValue<number> }) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const tf = useDerivedValue(() => [{ translateX: p.x + Math.sin((v.value + base) * 6.283) * size }, { translateY: p.y - v.value * size * 4 }, { scale: size }]);
  const op = useDerivedValue(() => (1 - v.value) * 0.5);
  return <Group transform={tf} opacity={op}><Path path={GHOST} color="#D2E2FF"><BlurMask blur={4} style="solid" /></Path></Group>;
}

// Spectre: a haunted wireframe leaking ghostly wisps that drift up and dissolve.
export function Spectre({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const pts = sample(f.meshPts, 22);
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#0A1226', '#03060F']} opacity={0.3} />
      <MeshWire mesh={f.mesh} color="#9FB8FF" width={2} blur={9} opacity={0.5} />
      {pts.map((p, i) => (
        <Wisp key={i} p={p} size={f.faceW * 0.07 * (0.7 + rnd(i))} dur={2 + rnd(i, 2) * 1.5} base={rnd(i, 3)} clock={clock} />
      ))}
    </>
  );
}
