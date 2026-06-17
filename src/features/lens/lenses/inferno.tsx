import React from 'react';
import { Circle, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { off, rnd, FlameStack, Drifter, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A hellish world: smouldering red grade, a lava glow rising from below, embers everywhere, and a
// crown of flames across the brow.
export function Inferno({ f, clock, w, h }: LensProps) {
  const rad = (f.rollDeg * Math.PI) / 180;
  const slots = [-0.5, -0.27, -0.05, 0.18, 0.4];
  const base = off(f, f.eyeMid, f.faceW * 0.5, 0);
  return (
    <>
      {/* ember-lit air + hellish edge vignette + lava glow from below */}
      <ScreenTint w={w} h={h} colors={['#2A0A00', '#5A1400', '#1A0500']} opacity={0.4} />
      <WorldVignette w={w} h={h} colors={['rgba(120,20,0,0)', 'rgba(90,15,0,0.4)', 'rgba(20,2,0,0.8)']} />
      <GlowOrb x={w * 0.5} y={h * 1.02} r={w * 0.9} colors={['rgba(255,120,0,0.55)', 'rgba(200,30,0,0)']} opacity={0.8} blur={36} />
      <Motes w={w} h={h} count={28} color="#FF7A1A" clock={clock} dir={-1} sizeMin={1.5} sizeMax={5} seed={2} />
      <Circle cx={base.x} cy={base.y} r={f.faceW * 0.9} opacity={0.3}>
        <RadialGradient c={vec(base.x, base.y)} r={f.faceW * 0.9} colors={['#FF6B00', 'rgba(255,45,0,0)']} />
        <BlurMask blur={20} style="normal" />
      </Circle>
      {slots.map((t, i) => {
        const lift = f.faceW * 0.52 - Math.abs(t) * f.faceW * 0.12;
        const p = off(f, f.eyeMid, lift, t * f.faceW * 1.1);
        const size = f.faceW * (0.46 - Math.abs(t) * 0.16);
        return <FlameStack key={i} x={p.x} y={p.y} size={size} roll={rad} base={i * 1.7} clock={clock} />;
      })}
      {Array.from({ length: 14 }).map((_, i) => {
        const sx = off(f, f.eyeMid, f.faceW * 0.45, (rnd(i) - 0.5) * f.faceW * 1.2);
        return <Drifter key={`e${i}`} x0={sx.x} y0={sx.y} sway={f.faceW * 0.12} travel={-f.faceW * (0.6 + rnd(i, 2) * 0.5)}
          size={f.faceW * (0.015 + rnd(i, 3) * 0.02)} dur={1.2 + rnd(i, 4) * 1.2} base={rnd(i, 5)} color={i % 2 ? '#FFB000' : '#FF5A00'} clock={clock} />;
      })}
    </>
  );
}
