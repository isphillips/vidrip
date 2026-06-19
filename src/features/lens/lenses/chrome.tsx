import React from 'react';
import { Group, Path, Circle, SweepGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { ovalPath, facePaths } from './_meshKit';
import type { LensProps } from '../core';

// Chrome: liquid metal — a polished blue-silver fill clipped to the face, a sheen sweeping across, and
// bright chrome rims on every contour.
export function Chrome({ f, clock }: LensProps) {
  if (!f.mesh) { return null; }
  const oval = ovalPath(f.mesh);
  const accents = facePaths(f.mesh);
  const c = vec(f.nose.x, f.nose.y);
  const rot = useDerivedValue(() => [{ rotate: clock.value * 0.5 }]);
  const sheenX = useDerivedValue(() => {
    const t = (clock.value * 0.5) % 2;
    const k = t < 1 ? t : 2 - t;
    return f.eyeMid.x - f.faceW * 0.8 + k * f.faceW * 1.6;
  });
  return (
    <Group>
      <Group clip={oval}>
        <Path path={oval} opacity={0.7}>
          <SweepGradient c={c} origin={c} transform={rot} colors={['#2B3440', '#9FB6CF', '#FFFFFF', '#5B6B80', '#CFE0F5', '#2B3440']} />
        </Path>
        <Circle cx={sheenX} cy={f.nose.y} r={f.faceW * 0.45} color="rgba(255,255,255,0.5)"><BlurMask blur={28} style="normal" /></Circle>
      </Group>
      {accents.map((p, i) => (
        <Path key={i} path={p} style="stroke" strokeWidth={2} strokeJoin="round" color="#DCEBFF"><BlurMask blur={4} style="solid" /></Path>
      ))}
    </Group>
  );
}
