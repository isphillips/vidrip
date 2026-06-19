import React from 'react';
import { Group, Path, Points, SweepGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { ovalPath } from './_meshKit';
import { ScreenTint, Bloom, Motes, type LensProps } from '../core';

// Nebula: a swirling deep-space cloud poured into the face, set in a deep starfield with a glowing
// galactic core, and the mesh vertices twinkling as stars.
export function Nebula({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const oval = ovalPath(f.mesh);
  const c = vec(f.nose.x, f.nose.y);
  const rot = useDerivedValue(() => [{ rotate: clock.value * 0.4 }]);
  const tw = useDerivedValue(() => 1.6 + 1.4 * Math.abs(Math.sin(clock.value * 2)));
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#100425', '#05010F']} opacity={0.4} />
      {/* deep starfield behind */}
      <Motes w={w} h={h} count={46} color="#FFFFFF" clock={clock} dir={-1} sizeMin={1} sizeMax={3} star seed={31} />
      {/* glowing galactic core bloom behind the head */}
      <Bloom x={c.x} y={c.y} r={f.faceW * 1.4} inner="rgba(180,90,255,0.4)" outer="rgba(60,20,140,0)" opacity={0.55} />
      <Group clip={oval} opacity={0.82}>
        <Path path={oval}>
          <SweepGradient c={c} origin={c} transform={rot} colors={['#3A0CA3', '#F72585', '#4361EE', '#7209B7', '#3A0CA3']} />
          <BlurMask blur={6} style="normal" />
        </Path>
      </Group>
      <Points points={f.meshPts ?? []} mode="points" color="#FFFFFF" style="stroke" strokeWidth={tw} strokeCap="round">
        <BlurMask blur={2} style="solid" />
      </Points>
    </>
  );
}
