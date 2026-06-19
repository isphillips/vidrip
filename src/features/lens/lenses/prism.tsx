import React from 'react';
import { Group, Path, SweepGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { facePaths } from './_meshKit';
import type { LensProps } from '../core';

const RAINBOW = ['#FF0040', '#FF8A00', '#FFE600', '#33FF66', '#00CFFF', '#7A4DFF', '#FF0040'];

// Prism: the contours refract a full spectrum that slowly rotates around the face.
export function Prism({ f, clock }: LensProps) {
  if (!f.mesh) { return null; }
  const paths = facePaths(f.mesh);
  const c = vec(f.nose.x, f.nose.y);
  const rot = useDerivedValue(() => [{ rotate: clock.value * 0.8 }]);
  return (
    <Group>
      {paths.map((p, i) => (
        <Path key={i} path={p} style="stroke" strokeWidth={3} strokeJoin="round" strokeCap="round">
          <SweepGradient c={c} origin={c} transform={rot} colors={RAINBOW} />
          <BlurMask blur={6} style="solid" />
        </Path>
      ))}
    </Group>
  );
}
