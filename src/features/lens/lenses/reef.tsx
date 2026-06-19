import React from 'react';
import { Group } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { MeshWire, sample } from './_meshKit';
import { Bubble, GlowOrb, ScreenTint, rnd, type LensProps } from '../core';

// Reef: submerged — a cool aqua wash with drifting caustic light, a faint coral wireframe, and strings
// of rim-lit bubbles wobbling up off the face.
export function Reef({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const pts = sample(f.meshPts, 11);
  const caustic = useDerivedValue(() => [{ translateX: Math.sin(clock.value * 0.28) * w * 0.05 }, { translateY: Math.cos(clock.value * 0.2) * h * 0.03 }]);
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#003B5C', '#001A2E']} opacity={0.3} />
      <Group transform={caustic}>
        <GlowOrb x={w * 0.3} y={h * 0.32} r={w * 0.5} colors={['rgba(120,220,255,0.12)', 'rgba(120,220,255,0)']} opacity={0.6} blur={42} />
        <GlowOrb x={w * 0.74} y={h * 0.6} r={w * 0.42} colors={['rgba(95,208,255,0.1)', 'rgba(95,208,255,0)']} opacity={0.5} blur={44} />
      </Group>
      <MeshWire mesh={f.mesh} color="#5FD0FF" width={1.6} blur={6} opacity={0.55} />
      {pts.map((p, i) => (
        <Bubble key={i} x0={p.x} y0={p.y} sway={f.faceW * 0.05} travel={-f.faceW * 1.1}
          size={f.faceW * (0.016 + 0.026 * rnd(i))} dur={2.2 + rnd(i, 2) * 1.5} base={rnd(i, 3)}
          color="rgba(205,242,255,0.85)" clock={clock} />
      ))}
    </>
  );
}
