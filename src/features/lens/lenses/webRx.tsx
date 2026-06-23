import React from 'react';
import { Group, Path, Points, BlurMask, Skia } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { FACE_OVAL, type Pt, type ReactiveLensProps } from '../core';

// Reactive (UI-thread) Web — same look as ./web (spokes from the nose to jaw + concentric rings + dew),
// rebuilt on the UI thread from the flat mesh. Legacy Web stays the catalog Comp (replay/bake).
const STEP = Math.max(1, Math.floor(FACE_OVAL.length / 14));

export function WebRx({ f, clock }: ReactiveLensProps) {
  const web = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const ff = f.value;
    if (!ff) { return p; }
    const xy = ff.xy, cx = ff.nose.x, cy = ff.nose.y;
    const ring: number[] = [];
    for (let i = 0; i < FACE_OVAL.length; i += STEP) { const idx = FACE_OVAL[i]; if (!isNaN(xy[2 * idx])) { ring.push(idx); } }
    // spokes from the nose out to each ring point
    for (let k = 0; k < ring.length; k++) { p.moveTo(cx, cy); p.lineTo(xy[2 * ring[k]], xy[2 * ring[k] + 1]); }
    // concentric threads
    const ts = [0.4, 0.65, 0.9];
    for (let ti = 0; ti < ts.length; ti++) {
      const t = ts[ti];
      for (let k = 0; k < ring.length; k++) {
        const x = cx + (xy[2 * ring[k]] - cx) * t, y = cy + (xy[2 * ring[k] + 1] - cy) * t;
        if (k === 0) { p.moveTo(x, y); } else { p.lineTo(x, y); }
      }
      if (ring.length) { p.lineTo(cx + (xy[2 * ring[0]] - cx) * t, cy + (xy[2 * ring[0] + 1] - cy) * t); }
    }
    return p;
  });
  const dew = useDerivedValue(() => {
    const ff = f.value;
    if (!ff) { return [] as Pt[]; }
    const xy = ff.xy, cx = ff.nose.x, cy = ff.nose.y, out: Pt[] = [];
    for (let i = 0; i < FACE_OVAL.length; i += STEP) {
      const idx = FACE_OVAL[i];
      if (!isNaN(xy[2 * idx])) { out.push({ x: cx + (xy[2 * idx] - cx) * 0.65, y: cy + (xy[2 * idx + 1] - cy) * 0.65 }); }
    }
    return out;
  });
  const op = useDerivedValue(() => 0.5 + 0.3 * Math.abs(Math.sin(clock.value * 1.2)));
  return (
    <Group opacity={op}>
      <Path path={web} style="stroke" strokeWidth={1.2} color="#EAF2FF"><BlurMask blur={1.5} style="solid" /></Path>
      <Points points={dew} mode="points" color="#BFE0FF" style="stroke" strokeWidth={3} strokeCap="round"><BlurMask blur={2} style="solid" /></Points>
    </Group>
  );
}
