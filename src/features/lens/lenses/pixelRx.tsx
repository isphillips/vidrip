import React from 'react';
import { Group, Points } from '@shopify/react-native-skia';
import { useDerivedValue, interpolateColor } from 'react-native-reanimated';
import { useMeshPoints } from './_meshKit';
import type { ReactiveLensProps } from '../core';

// Reactive (UI-thread) Pixel — same look as ./pixel. Legacy Pixel stays the catalog Comp (replay/bake).
export function PixelRx({ f, clock }: ReactiveLensProps) {
  const pts = useMeshPoints(f);
  const c1 = useDerivedValue(() => interpolateColor((Math.sin(clock.value * 1.5) + 1) / 2, [0, 1], ['#FF004D', '#00E5FF']));
  const c2 = useDerivedValue(() => interpolateColor((Math.sin(clock.value * 1.5 + 2) + 1) / 2, [0, 1], ['#FFD300', '#A0FF00']));
  const sw1 = useDerivedValue(() => (f.value?.faceW ?? 0) * 0.05);
  const sw2 = useDerivedValue(() => (f.value?.faceW ?? 0) * 0.025);
  return (
    <Group>
      <Points points={pts} mode="points" color={c1} style="stroke" strokeWidth={sw1} strokeCap="square" />
      <Points points={pts} mode="points" color={c2} style="stroke" strokeWidth={sw2} strokeCap="square" />
    </Group>
  );
}
