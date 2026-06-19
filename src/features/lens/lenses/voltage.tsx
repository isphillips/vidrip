import React from 'react';
import { Group, Path, BlurMask, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { MeshWire, sample } from './_meshKit';
import { rnd, type Pt, type LensProps } from '../core';

// A single crackling bolt between two mesh vertices — jagged, jittering, strobing.
function Bolt({ a, b, base, clock }: { a: Pt; b: Pt; base: number; clock: SharedValue<number> }) {
  const path = useDerivedValue(() => {
    'worklet';
    const p = Skia.Path.Make();
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / (len || 1), ny = (b.x - a.x) / (len || 1);
    const segs = 5;
    p.moveTo(a.x, a.y);
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const mx = a.x + (b.x - a.x) * t, my = a.y + (b.y - a.y) * t;
      const j = Math.sin(clock.value * 28 + base + i * 1.7) * len * 0.09;
      p.lineTo(mx + nx * j, my + ny * j);
    }
    p.lineTo(b.x, b.y);
    return p;
  });
  const op = useDerivedValue(() => { const s = Math.sin(clock.value * 13 + base); return s > 0 ? s * s : 0; });
  return (
    <Group opacity={op}>
      <Path path={path} style="stroke" strokeWidth={5} strokeCap="round" color="rgba(90,200,255,0.5)"><BlurMask blur={5} style="normal" /></Path>
      <Path path={path} style="stroke" strokeWidth={1.6} strokeCap="round" color="#EAFBFF" />
    </Group>
  );
}

// Voltage: arcs of electricity leap across the face between mesh points, over a faint charged wireframe.
export function Voltage({ f, clock }: LensProps) {
  if (!f.mesh) { return null; }
  const pts = sample(f.meshPts, 8);
  const n = pts.length;
  const bolts: { a: Pt; b: Pt; base: number }[] = [];
  for (let i = 0; n > 1 && i < 7; i++) {
    const a = pts[Math.floor(rnd(i, 1) * n) % n];
    const b = pts[Math.floor(rnd(i, 2) * n) % n];
    if (a && b) { bolts.push({ a, b, base: i * 1.31 }); }
  }
  return (
    <Group>
      <MeshWire mesh={f.mesh} color="#3A6BFF" width={1.5} blur={5} opacity={0.45} />
      {bolts.map((bl, i) => <Bolt key={i} a={bl.a} b={bl.b} base={bl.base} clock={clock} />)}
    </Group>
  );
}
