import React from 'react';
import { Group, Points } from '@shopify/react-native-skia';
import { useDerivedValue, interpolateColor } from 'react-native-reanimated';
import type { LensProps } from '../core';

// Pixel: the face rasterized into blocky 8-bit squares that cycle through retro arcade colours.
export function Pixel({ f, clock }: LensProps) {
  if (!f.mesh) { return null; }
  const c1 = useDerivedValue(() => interpolateColor((Math.sin(clock.value * 1.5) + 1) / 2, [0, 1], ['#FF004D', '#00E5FF']));
  const c2 = useDerivedValue(() => interpolateColor((Math.sin(clock.value * 1.5 + 2) + 1) / 2, [0, 1], ['#FFD300', '#A0FF00']));
  return (
    <Group>
      <Points points={f.meshPts ?? []} mode="points" color={c1} style="stroke" strokeWidth={f.faceW * 0.05} strokeCap="square" />
      <Points points={f.meshPts ?? []} mode="points" color={c2} style="stroke" strokeWidth={f.faceW * 0.025} strokeCap="square" />
    </Group>
  );
}
