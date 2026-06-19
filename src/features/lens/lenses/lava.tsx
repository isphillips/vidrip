import React from 'react';
import { Group, Path, RadialGradient, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { ovalPath, MeshWire, sample } from './_meshKit';
import { Drifter, Smoke, off, rnd, type LensProps } from '../core';

// Lava: the face glows molten — a flickering radial heat fill under cracked, glowing contours, with
// embers streaming up and heat-smoke rising overhead. Open your mouth to stoke it hotter.
export function Lava({ f, clock }: LensProps) {
  if (!f.mesh) { return null; }
  const oval = ovalPath(f.mesh);
  const heat = f.mouthOpen ?? 0;
  const embers = sample(f.meshPts, 14);
  const crown = off(f, f.eyeMid, f.faceW * 0.75, 0);
  // Molten glow flicker — the heat throbs like real magma.
  const flick = useDerivedValue(() => 0.62 + 0.22 * Math.abs(Math.sin(clock.value * 9)) + 0.12 * Math.sin(clock.value * 21));
  return (
    <Group>
      <Group clip={oval} opacity={flick}>
        <Path path={oval}>
          <RadialGradient c={vec(f.nose.x, f.nose.y)} r={f.faceW * 1.15} colors={['#FFF1A6', '#FF7A00', '#C21500', '#3A0600']} />
        </Path>
      </Group>
      {/* heat-smoke rising off the top */}
      <Smoke x={crown.x} y={crown.y} count={4} size={f.faceW * 0.42} travel={-f.faceW * 2} color="rgba(50,34,28,0.5)" clock={clock} />
      <MeshWire mesh={f.mesh} color="#FF8A1E" width={2 + 2 * heat} blur={9} core="#FFE08A" />
      {embers.map((p, i) => (
        <Drifter key={i} x0={p.x} y0={p.y} sway={f.faceW * 0.06} travel={-f.faceW * (0.5 + heat)}
          size={f.faceW * 0.02 * (0.7 + rnd(i))} dur={1.5 + rnd(i, 2)} base={rnd(i, 3)}
          color={i % 2 ? '#FFB000' : '#FF5A00'} clock={clock} />
      ))}
    </Group>
  );
}
