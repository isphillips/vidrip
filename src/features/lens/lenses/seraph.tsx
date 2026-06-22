import React from 'react';
import { Group, Skia, Path, BlurMask, SweepGradient, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { MeshWire } from './_meshKit';
import { off, GodRays, Bloom, type LensProps } from '../core';

const HALO_GOLD = ['#FFE680', '#FFFBE0', '#FFC93C', '#FFFBE0', '#FFE680'];

// Seraph: a radiant white wireframe haloed in gold, bathed in a soft holy bloom with shafts of light.
export function Seraph({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const rad = (f.rollDeg * Math.PI) / 180;
  // The halo is a perspective ring (flattened ellipse) seated just above the crown, tilted to follow
  // the head. Its back arc passes behind the head (dimmer/thinner); its front arc crosses the brow
  // (bright/thick) — so it reads as worn rather than a flat disc on screen.
  const halo = off(f, f.eyeMid, f.faceW * 0.82, 0);
  const rx = f.faceW * 0.62, ry = f.faceW * 0.2;
  const oval = Skia.XYWHRect(-rx, -ry, rx * 2, ry * 2);
  const backArc = (() => { const p = Skia.Path.Make(); p.addArc(oval, 180, 180); return p; })();  // top (behind)
  const frontArc = (() => { const p = Skia.Path.Make(); p.addArc(oval, 0, 180); return p; })();    // bottom (front)
  const haloTf = useDerivedValue(() => [
    { translateX: halo.x },
    { translateY: halo.y + Math.sin(clock.value * 1.5) * f.faceW * 0.03 },
    { rotate: rad },
    { scale: 1 + 0.03 * Math.sin(clock.value * 2) },
  ]);
  const c = { x: f.nose.x, y: f.eyeMid.y };
  const breath = useDerivedValue(() => 0.55 + 0.35 * Math.abs(Math.sin(clock.value * 1.3)));
  return (
    <>
      <GodRays w={w} h={h} x={halo.x} y={halo.y} color="rgba(255,245,200,0.5)" clock={clock} length={f.faceW * 2} />
      {/* soft divine bloom behind the head + a tight glow at the halo */}
      <Group opacity={breath}>
        <Bloom x={f.nose.x} y={f.eyeMid.y} r={f.faceW * 1.3} inner="rgba(255,250,212,0.6)" outer="rgba(255,240,180,0)" opacity={0.5} />
      </Group>
      <Group opacity={breath}>
        <Bloom x={c.x} y={c.y} r={f.faceW * 1.45} inner="rgba(255,246,207,0.7)" outer="rgba(255,240,180,0)" opacity={0.5} />
      </Group>
      <Group transform={haloTf}>
        {/* back of the ring — behind the head, so dimmer and thinner */}
        <Path path={backArc} style="stroke" strokeWidth={f.faceW * 0.055} strokeCap="round" opacity={0.5} color="#FFE9A8">
          <BlurMask blur={6} style="solid" />
        </Path>
        {/* glow under the ring */}
        <Path path={frontArc} style="stroke" strokeWidth={f.faceW * 0.18} strokeCap="round" opacity={0.35} color="#FFE680">
          <BlurMask blur={f.faceW * 0.12} style="normal" />
        </Path>
        {/* front of the ring — worn across the brow, bright and thick */}
        <Path path={frontArc} style="stroke" strokeWidth={f.faceW * 0.09} strokeCap="round">
          <SweepGradient c={vec(0, 0)} colors={HALO_GOLD} />
          <BlurMask blur={4} style="solid" />
        </Path>
      </Group>
      <MeshWire mesh={f.mesh} color="#FFFAD0" width={2} blur={8} core="#FFFFFF" />
    </>
  );
}
