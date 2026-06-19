import React from 'react';
import { Group, Circle, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { MeshWire, sample } from './_meshKit';
import { FlameStack, Smoke, off, rnd, type LensProps } from '../core';

// Wildfire: the whole face is alight — flames lick up from the mesh over a glowing ember wireframe,
// casting flickering firelight, with smoke pouring off the top. Open your mouth to fan it bigger.
export function Wildfire({ f, clock }: LensProps) {
  if (!f.mesh) { return null; }
  const pts = sample(f.meshPts, 13);
  const grow = 1 + (f.mouthOpen ?? 0) * 0.8;
  const crown = off(f, f.eyeMid, f.faceW * 0.8, 0);
  const flick = useDerivedValue(() => 0.45 + 0.32 * Math.abs(Math.sin(clock.value * 8)) + 0.16 * Math.sin(clock.value * 18));
  return (
    <Group>
      {/* flickering firelight cast over the face */}
      <Group opacity={flick}>
        <Circle cx={f.nose.x} cy={f.eyeMid.y} r={f.faceW * 1.0} opacity={0.32}>
          <RadialGradient c={vec(f.nose.x, f.eyeMid.y)} r={f.faceW * 1.0} colors={['#FF8A1E', 'rgba(255,60,0,0)']} />
          <BlurMask blur={22} style="normal" />
        </Circle>
      </Group>
      <Smoke x={crown.x} y={crown.y} count={5} size={f.faceW * 0.5} travel={-f.faceW * 2.4} color="rgba(44,30,24,0.55)" clock={clock} />
      <MeshWire mesh={f.mesh} color="#FF7A00" width={2} blur={8} core="#FFD27A" />
      {pts.map((p, i) => (
        <FlameStack key={i} x={p.x} y={p.y} size={f.faceW * 0.1 * grow * (0.7 + rnd(i))} roll={0} base={rnd(i, 2) * 6.283} clock={clock} />
      ))}
    </Group>
  );
}
