import React from 'react';
import { Group, Circle, Path, LinearGradient, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { off, rnd, CRYSTAL, Drifter, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A frozen world: pale icy grade, a frosted white rime creeping in from the edges, a cold light, a
// full-screen snowfall, and an icy crown of crystals across the brow.
export function Frost({ f, clock, w, h }: LensProps) {
  const c = { x: f.nose.x, y: (f.eyeMid.y + f.mouth.y) / 2 };
  const rad = (f.rollDeg * Math.PI) / 180;
  const crystals = [-0.4, -0.2, 0, 0.2, 0.4];
  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(210,240,255,0.5)', 'rgba(150,200,240,0.18)', 'rgba(120,180,230,0.4)']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(230,248,255,0)', 'rgba(190,225,255,0.3)', 'rgba(150,200,240,0.6)']} />
      <GlowOrb x={w * 0.5} y={h * 0.15} r={w * 0.6} colors={['rgba(220,245,255,0.4)', 'rgba(160,210,250,0)']} opacity={0.7} blur={38} />
      <Motes w={w} h={h} count={36} color="rgba(245,252,255,0.95)" clock={clock} dir={1} sizeMin={1.5} sizeMax={5} seed={6} />
      <Circle cx={c.x} cy={c.y} r={f.faceW * 1.25} opacity={0.28}>
        <RadialGradient c={vec(c.x, c.y)} r={f.faceW * 1.25} colors={['#BEE7FF', 'rgba(120,180,255,0)']} />
        <BlurMask blur={22} style="normal" />
      </Circle>
      {crystals.map((t, i) => {
        const lift = f.faceW * 0.5 - Math.abs(t) * f.faceW * 0.14;
        const p = off(f, f.eyeMid, lift, t * f.faceW * 1.1);
        const sz = f.faceW * (0.34 - Math.abs(t) * 0.12);
        return (
          <Group key={i} transform={[{ translateX: p.x }, { translateY: p.y }, { rotate: rad }, { scale: sz }]}>
            <Path path={CRYSTAL}><LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={['#FFFFFF', '#9FD8FF', '#4FA8E0']} /><BlurMask blur={0.03} style="solid" /></Path>
          </Group>
        );
      })}
      {Array.from({ length: 16 }).map((_, i) => {
        const sx = off(f, f.eyeMid, f.faceW * 0.7, (rnd(i) - 0.5) * f.faceW * 1.8);
        return <Drifter key={i} x0={sx.x} y0={sx.y} sway={f.faceW * 0.14} travel={f.faceW * (0.9 + rnd(i, 2) * 0.6)}
          size={f.faceW * (0.02 + rnd(i, 3) * 0.02)} dur={2.5 + rnd(i, 4) * 2} base={rnd(i, 5)} color="#EAF6FF" clock={clock} />;
      })}
    </>
  );
}
