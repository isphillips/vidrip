import React from 'react';
import { Group, Path, Circle, SweepGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { meshPath, FACE_OVAL, LIPS_OUTER, RIGHT_EYE, LEFT_EYE, RIGHT_BROW, LEFT_BROW, type LensProps } from '../core';

// Gilded: a liquid-gold mask — the face filled with a metallic sweep gradient (clipped to the jaw),
// a bright sheen sweeping across it, and glowing gold rims on the brows / eyes / lips.
export function Gilded({ f, clock }: LensProps) {
  if (!f.mesh) { return null; }
  const mesh = f.mesh;
  const oval = meshPath(mesh, FACE_OVAL, true);
  const accents = [
    meshPath(mesh, RIGHT_BROW, false),
    meshPath(mesh, LEFT_BROW, false),
    meshPath(mesh, RIGHT_EYE, true),
    meshPath(mesh, LEFT_EYE, true),
    meshPath(mesh, LIPS_OUTER, true),
  ];
  const c = vec(f.nose.x, f.nose.y);
  // Sheen ping-pongs left↔right across the face width.
  const sheenX = useDerivedValue(() => {
    const t = (clock.value * 0.5) % 2;            // 0..2
    const k = t < 1 ? t : 2 - t;                  // 0..1..0
    return f.eyeMid.x - f.faceW * 0.8 + k * f.faceW * 1.6;
  });
  const sheenR = f.faceW * 0.5;
  return (
    <Group>
      <Group clip={oval}>
        {/* metallic base */}
        <Path path={oval} opacity={0.6}>
          <SweepGradient c={c} colors={['#5a3d00', '#FFE07A', '#FFF7D6', '#B9831A', '#FFE07A', '#5a3d00']} />
        </Path>
        {/* travelling sheen */}
        <Circle cx={sheenX} cy={f.nose.y} r={sheenR} color="rgba(255,252,230,0.55)">
          <BlurMask blur={30} style="normal" />
        </Circle>
      </Group>
      {/* glowing gold rim */}
      <Path path={oval} style="stroke" strokeWidth={3} strokeJoin="round" color="#FFE89A">
        <BlurMask blur={6} style="solid" />
      </Path>
      {accents.map((p, i) => (
        <Path key={i} path={p} style="stroke" strokeWidth={2} strokeJoin="round" strokeCap="round" color="#FFE89A">
          <BlurMask blur={3} style="solid" />
        </Path>
      ))}
    </Group>
  );
}
