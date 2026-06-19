import React from 'react';
import { Group, Path, Points, BlurMask } from '@shopify/react-native-skia';
import { useDerivedValue, interpolateColor } from 'react-native-reanimated';
import {
  meshPath, FACE_OVAL, RIGHT_EYE, LEFT_EYE, LIPS_OUTER, RIGHT_BROW, LEFT_BROW, NOSE_BRIDGE,
  type LensProps,
} from '../core';

const LOOPS: { idx: number[]; close: boolean }[] = [
  { idx: FACE_OVAL, close: true },
  { idx: RIGHT_EYE, close: true },
  { idx: LEFT_EYE, close: true },
  { idx: LIPS_OUTER, close: true },
  { idx: RIGHT_BROW, close: false },
  { idx: LEFT_BROW, close: false },
  { idx: NOSE_BRIDGE, close: false },
];

// Cyber mask: a glowing neon wireframe locked to every facial contour, hue-shifting cyan↔magenta with
// a pulsing glow, plus a lit node on every one of the 478 mesh vertices.
export function CyberMesh({ f, clock }: LensProps) {
  if (!f.mesh) { return null; }
  const mesh = f.mesh;
  const paths = LOOPS.map((l) => meshPath(mesh, l.idx, l.close));
  const neon = useDerivedValue(() =>
    interpolateColor((Math.sin(clock.value * 1.6) + 1) / 2, [0, 1], ['#00E5FF', '#F72585']));
  const glow = useDerivedValue(() => 5 + 3 * Math.sin(clock.value * 3));
  return (
    <Group>
      {/* glow pass */}
      {paths.map((p, i) => (
        <Path key={`g${i}`} path={p} style="stroke" strokeWidth={2.5} strokeJoin="round" strokeCap="round" color={neon}>
          <BlurMask blur={glow} style="solid" />
        </Path>
      ))}
      {/* crisp white core */}
      {paths.map((p, i) => (
        <Path key={`c${i}`} path={p} style="stroke" strokeWidth={1} strokeJoin="round" strokeCap="round" color="#FFFFFF" />
      ))}
      {/* mesh nodes */}
      <Points points={f.meshPts ?? []} mode="points" color={neon} style="stroke" strokeWidth={3} strokeCap="round" />
    </Group>
  );
}
