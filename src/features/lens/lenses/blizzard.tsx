import React from 'react';
import { MeshWire, sample } from './_meshKit';
import { Drifter, Motes, WorldVignette, ScreenTint, rnd, type LensProps } from '../core';

// Blizzard: a frosted wireframe in a whiteout — a full-screen snow backdrop for depth, an icy edge
// rime, and big foreground flakes spawning off the mesh and tumbling down.
export function Blizzard({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const pts = sample(f.meshPts, 12);
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#11314A', '#0A1C2C']} opacity={0.25} />
      <WorldVignette w={w} h={h} colors={['rgba(220,245,255,0)', 'rgba(160,205,235,0.28)', 'rgba(120,170,210,0.5)']} />
      {/* background snow flurry filling the frame */}
      <Motes w={w} h={h} count={42} color="rgba(245,252,255,0.9)" clock={clock} dir={1} sizeMin={1.5} sizeMax={5} star seed={12} />
      <MeshWire mesh={f.mesh} color="#DFF6FF" width={1.6} blur={5} opacity={0.6} />
      {pts.map((p, i) => (
        <Drifter key={i} x0={p.x} y0={p.y} sway={f.faceW * 0.08} travel={f.faceW * 0.9}
          size={f.faceW * (0.018 + 0.022 * rnd(i))} dur={2.5 + rnd(i, 2) * 2} base={rnd(i, 3)}
          color="#FFFFFF" clock={clock} star />
      ))}
    </>
  );
}
