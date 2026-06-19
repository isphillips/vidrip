import React from 'react';
import { Group, Points, BlurMask } from '@shopify/react-native-skia';
import { useDerivedValue, interpolateColor } from 'react-native-reanimated';
import { MeshWire } from './_meshKit';
import type { LensProps } from '../core';

// Circuit: the face as a living circuit board — contours hum cyan↔lime while square nodes pulse on
// every mesh vertex like data flowing through the traces.
export function Circuit({ f, clock }: LensProps) {
  if (!f.mesh) { return null; }
  const col = useDerivedValue(() => interpolateColor((Math.sin(clock.value * 1.4) + 1) / 2, [0, 1], ['#00FFC6', '#9BFF1F']));
  const node = useDerivedValue(() => 3 + 2 * Math.abs(Math.sin(clock.value * 5)));
  return (
    <Group>
      <MeshWire mesh={f.mesh} color={col} width={2.4} blur={7} core="#E9FFF6" />
      <Points points={f.meshPts ?? []} mode="points" color="#CFFFE6" style="stroke" strokeWidth={node} strokeCap="square">
        <BlurMask blur={3} style="solid" />
      </Points>
    </Group>
  );
}
