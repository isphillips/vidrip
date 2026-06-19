import React from 'react';
import { Group, Path } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { MeshWire, sample } from './_meshKit';
import { ScreenTint, CRYSTAL, Sparkle, rnd, type LensProps } from '../core';

// Frostbite: a sheet of ice crystallizes over the face — frosted contours and glinting shards that
// shimmer in and out, each catching a sharp star of light.
export function Frostbite({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const shards = sample(f.meshPts, 16);
  const glint = useDerivedValue(() => 0.45 + 0.55 * Math.abs(Math.sin(clock.value * 1.6)));
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#0A2540', '#06121F']} opacity={0.22} />
      <MeshWire mesh={f.mesh} color="#BFEFFF" width={2.2} blur={6} core="#FFFFFF" opacity={0.9} />
      <Group opacity={glint}>
        {shards.map((p, i) => {
          const s = f.faceW * 0.045 * (0.55 + rnd(i));
          return (
            <Group key={i} transform={[{ translateX: p.x }, { translateY: p.y }, { rotate: rnd(i, 2) * 6.283 }, { scale: s }]}>
              <Path path={CRYSTAL} color="#E8FBFF" />
            </Group>
          );
        })}
      </Group>
      {/* sharp icy glints on every shard */}
      {shards.map((p, i) => (
        <Sparkle key={`g${i}`} x={p.x} y={p.y} size={f.faceW * 0.035 * (0.6 + rnd(i, 3))} base={i * 1.2} speed={2.2 + rnd(i, 4) * 2.5} color="#FFFFFF" clock={clock} />
      ))}
    </>
  );
}
