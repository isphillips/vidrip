import React from 'react';
import { Group, Path, Points, BlurMask, Skia } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { FACE_OVAL, type Pt, type LensProps } from '../core';

// Web: a silver spider-web spun across the face — spokes from the nose out to the jaw, ringed with
// concentric threads and beaded with dew.
export function Web({ f, clock }: LensProps) {
  if (!f.mesh) { return null; }
  const mesh = f.mesh;
  const ring: Pt[] = [];
  const stepN = Math.max(1, Math.floor(FACE_OVAL.length / 14));
  for (let i = 0; i < FACE_OVAL.length; i += stepN) { const v = mesh[FACE_OVAL[i]]; if (v) { ring.push(v); } }
  const cx = f.nose.x, cy = f.nose.y;
  const web = Skia.Path.Make();
  ring.forEach((pt) => { web.moveTo(cx, cy); web.lineTo(pt.x, pt.y); });
  [0.4, 0.65, 0.9].forEach((t) => {
    ring.forEach((pt, i) => {
      const x = cx + (pt.x - cx) * t, y = cy + (pt.y - cy) * t;
      if (i === 0) { web.moveTo(x, y); } else { web.lineTo(x, y); }
    });
    const f0 = ring[0]; if (f0) { web.lineTo(cx + (f0.x - cx) * t, cy + (f0.y - cy) * t); }
  });
  const dew = ring.map((pt) => ({ x: cx + (pt.x - cx) * 0.65, y: cy + (pt.y - cy) * 0.65 }));
  const op = useDerivedValue(() => 0.5 + 0.3 * Math.abs(Math.sin(clock.value * 1.2)));
  return (
    <Group opacity={op}>
      <Path path={web} style="stroke" strokeWidth={1.2} color="#EAF2FF"><BlurMask blur={1.5} style="solid" /></Path>
      <Points points={dew} mode="points" color="#BFE0FF" style="stroke" strokeWidth={3} strokeCap="round"><BlurMask blur={2} style="solid" /></Points>
    </Group>
  );
}
