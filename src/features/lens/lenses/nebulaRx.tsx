import React from 'react';
import { Group, Path, Points, SweepGradient, RadialGradient, Circle, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { useOvalPath, useMeshPoints } from './_meshKit';
import { ScreenTint, Motes, type ReactiveLensProps } from '../core';

// Reactive (UI-thread) Nebula — same look as ./nebula. Legacy Nebula stays the catalog Comp (replay/bake).
const SPACE = ['#100425', '#05010F'];
const CORE = ['rgba(180,90,255,0.4)', 'rgba(60,20,140,0)'];
const SWIRL = ['#3A0CA3', '#F72585', '#4361EE', '#7209B7', '#3A0CA3'];

export function NebulaRx({ f, clock, w, h }: ReactiveLensProps) {
  const oval = useOvalPath(f);
  const pts = useMeshPoints(f);
  const c = useDerivedValue(() => vec(f.value?.nose.x ?? w / 2, f.value?.nose.y ?? h / 2));
  const rot = useDerivedValue(() => [{ rotate: clock.value * 0.4 }]);
  const tw = useDerivedValue(() => 1.6 + 1.4 * Math.abs(Math.sin(clock.value * 2)));
  const coreR = useDerivedValue(() => (f.value?.faceW ?? w * 0.3) * 1.4);
  return (
    <>
      <ScreenTint w={w} h={h} colors={SPACE} opacity={0.4} />
      {/* deep starfield behind */}
      <Motes w={w} h={h} count={46} color="#FFFFFF" clock={clock} dir={-1} sizeMin={1} sizeMax={3} star seed={31} />
      {/* glowing galactic core bloom behind the head */}
      <Circle c={c} r={coreR} opacity={0.55}>
        <RadialGradient c={c} r={coreR} colors={CORE} />
        <BlurMask blur={24} style="normal" />
      </Circle>
      <Group clip={oval} opacity={0.82}>
        <Path path={oval}>
          <SweepGradient c={c} origin={c} transform={rot} colors={SWIRL} />
          <BlurMask blur={6} style="normal" />
        </Path>
      </Group>
      <Points points={pts} mode="points" color="#FFFFFF" style="stroke" strokeWidth={tw} strokeCap="round">
        <BlurMask blur={2} style="solid" />
      </Points>
    </>
  );
}
