import React from 'react';
import { Group, Points, BlurMask } from '@shopify/react-native-skia';
import { useDerivedValue, interpolateColor } from 'react-native-reanimated';
import { MeshWireRx, useMeshPoints } from './_meshKit';
import type { ReactiveLensProps } from '../core';

// Reactive (UI-thread) Circuit — same look as ./circuit. Legacy Circuit stays the catalog Comp (replay/bake).
export function CircuitRx({ f, clock }: ReactiveLensProps) {
  const pts = useMeshPoints(f);
  const col = useDerivedValue(() => interpolateColor((Math.sin(clock.value * 1.4) + 1) / 2, [0, 1], ['#00FFC6', '#9BFF1F']));
  const node = useDerivedValue(() => 3 + 2 * Math.abs(Math.sin(clock.value * 5)));
  return (
    <Group>
      <MeshWireRx f={f} color={col} width={2.4} blur={7} core="#E9FFF6" />
      <Points points={pts} mode="points" color="#CFFFE6" style="stroke" strokeWidth={node} strokeCap="square">
        <BlurMask blur={3} style="solid" />
      </Points>
    </Group>
  );
}
