import React from 'react';
import { Group, Points, Path, BlurMask } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { meshPath, FACE_OVAL, RIGHT_EYE, LEFT_EYE, LIPS_OUTER, RIGHT_BROW, LEFT_BROW, ScreenTint, Bloom, Motes, type LensProps } from '../core';

// Star map: turns the face mesh into a twinkling constellation — every vertex a star, with faint
// lines tracing the brows / eyes / lips / jaw, over a deep-space colour grade.
export function StarMap({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const mesh = f.mesh;
  const lines = [
    meshPath(mesh, FACE_OVAL, true),
    meshPath(mesh, RIGHT_EYE, true),
    meshPath(mesh, LEFT_EYE, true),
    meshPath(mesh, LIPS_OUTER, true),
    meshPath(mesh, RIGHT_BROW, false),
    meshPath(mesh, LEFT_BROW, false),
  ];
  const twinkle = useDerivedValue(() => 2 + 1.6 * Math.abs(Math.sin(clock.value * 2.2)));
  const glow = useDerivedValue(() => 3 + 2 * Math.abs(Math.sin(clock.value * 2.2)));
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#0A0826', '#05021A']} opacity={0.4} />
      {/* faint nebula glow + a deep starfield for depth behind the constellation */}
      <Bloom x={f.nose.x} y={f.eyeMid.y} r={f.faceW * 1.35} inner="rgba(120,150,255,0.28)" outer="rgba(40,40,120,0)" opacity={0.5} />
      <Motes w={w} h={h} count={40} color="#FFFFFF" clock={clock} dir={-1} sizeMin={1} sizeMax={2.6} star seed={51} />
      <Group>
        {lines.map((p, i) => (
          <Path key={i} path={p} style="stroke" strokeWidth={1} color="rgba(150,190,255,0.45)">
            <BlurMask blur={2} style="solid" />
          </Path>
        ))}
        {/* soft star glow */}
        <Points points={f.meshPts ?? []} mode="points" color="#A8D0FF" style="stroke" strokeWidth={twinkle} strokeCap="round">
          <BlurMask blur={glow} style="solid" />
        </Points>
        {/* bright cores */}
        <Points points={f.meshPts ?? []} mode="points" color="#FFFFFF" style="stroke" strokeWidth={1.4} strokeCap="round" />
      </Group>
    </>
  );
}
