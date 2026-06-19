import React from 'react';
import { MeshWire } from './_meshKit';
import { FlameStack, off, ScreenTint, type LensProps } from '../core';

// Demon Mesh: a blood-red wireframe crowned with twin flame horns rising off the brow.
export function DemonMesh({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const roll = (f.rollDeg * Math.PI) / 180;
  const hornL = off(f, f.eyeMid, f.faceW * 0.72, -f.faceW * 0.42);
  const hornR = off(f, f.eyeMid, f.faceW * 0.72, f.faceW * 0.42);
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#2A0000', '#100000']} opacity={0.28} />
      <MeshWire mesh={f.mesh} color="#FF2A2A" width={2.4} blur={9} core="#FF9A6A" />
      <FlameStack x={hornL.x} y={hornL.y} size={f.faceW * 0.26} roll={-0.4 + roll} base={1.3} clock={clock} />
      <FlameStack x={hornR.x} y={hornR.y} size={f.faceW * 0.26} roll={0.4 + roll} base={2.7} clock={clock} />
    </>
  );
}
