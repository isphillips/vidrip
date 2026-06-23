import React from 'react';
import { Group, Path, BlurMask } from '@shopify/react-native-skia';
import { useDerivedValue, interpolateColor } from 'react-native-reanimated';
import { type ReactiveLensProps } from '../core';
import { useFaceWire, useDotPath } from './_meshKit';

// Reactive (UI-thread) Cyber Mesh — same look as ./cyberMesh, driven by SharedValue<MeshFrame> so it
// mounts once and the wire/nodes rebuild on the UI thread (no per-frame React reconcile). The legacy
// CyberMesh stays the catalog Comp for replay/bake.
export function CyberMeshRx({ f, clock }: ReactiveLensProps) {
  const wire = useFaceWire(f);
  const dots = useDotPath(f, 1.6); // node cloud (legacy drew <Points strokeWidth 3>)
  const neon = useDerivedValue(() =>
    interpolateColor((Math.sin(clock.value * 1.6) + 1) / 2, [0, 1], ['#00E5FF', '#F72585']));
  const glow = useDerivedValue(() => 5 + 3 * Math.sin(clock.value * 3));
  return (
    <Group>
      {/* glow pass */}
      <Path path={wire} style="stroke" strokeWidth={2.5} strokeJoin="round" strokeCap="round" color={neon}>
        <BlurMask blur={glow} style="solid" />
      </Path>
      {/* crisp white core */}
      <Path path={wire} style="stroke" strokeWidth={1} strokeJoin="round" strokeCap="round" color="#FFFFFF" />
      {/* lit node on every mesh vertex */}
      <Path path={dots} color={neon} />
    </Group>
  );
}
