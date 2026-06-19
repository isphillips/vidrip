import React from 'react';
import { Group } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { MeshWire } from './_meshKit';
import { ScreenTint, type LensProps } from '../core';

// Holo Mesh: a glitchy hologram — the wireframe splits into chromatic-aberration R/G/B copies that
// shear and flicker like a failing projection.
export function HoloMesh({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const dx = f.faceW * 0.018;
  const flick = useDerivedValue(() => 0.6 + 0.4 * Math.abs(Math.sin(clock.value * 20)));
  const shift = useDerivedValue(() => [{ translateX: dx * Math.sin(clock.value * 8) }]);
  return (
    <Group opacity={flick}>
      <ScreenTint w={w} h={h} colors={['rgba(0,50,70,0)', 'rgba(0,70,100,0.22)']} opacity={0.5} />
      <Group transform={[{ translateX: -dx }]}><MeshWire mesh={f.mesh} color="#FF003C" width={2} blur={3} opacity={0.7} /></Group>
      <Group transform={shift}><MeshWire mesh={f.mesh} color="#00FF6A" width={2} blur={3} opacity={0.7} /></Group>
      <Group transform={[{ translateX: dx }]}><MeshWire mesh={f.mesh} color="#00B3FF" width={2} blur={3} opacity={0.7} /></Group>
    </Group>
  );
}
