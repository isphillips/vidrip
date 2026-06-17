import React from 'react';
import { Circle, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { off, rnd, FlameStack, Drifter, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// An underworld: oppressive crimson dark closing in from the edges, a low blood glow, drifting
// embers, glowing red eyes, and flaming horns.
export function Demon({ f, clock, w, h }: LensProps) {
  const rad = (f.rollDeg * Math.PI) / 180;
  const hl = off(f, f.le, f.faceW * 0.55, -f.faceW * 0.12);
  const hr = off(f, f.re, f.faceW * 0.55, f.faceW * 0.12);
  const c = { x: f.nose.x, y: f.eyeMid.y };
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#1A0000', '#3A0400', '#0C0000']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(120,0,0,0)', 'rgba(70,0,0,0.5)', 'rgba(10,0,0,0.9)']} />
      <GlowOrb x={w * 0.5} y={h * 0.5} r={w * 0.6} colors={['rgba(180,0,0,0.25)', 'rgba(60,0,0,0)']} opacity={0.7} blur={44} />
      <Motes w={w} h={h} count={22} color="#FF4400" clock={clock} dir={-1} sizeMin={1.5} sizeMax={4.5} seed={5} />
      <Circle cx={c.x} cy={c.y} r={f.faceW * 1.2} opacity={0.3}>
        <RadialGradient c={vec(c.x, c.y)} r={f.faceW * 1.2} colors={['#FF1E00', 'rgba(120,0,0,0)']} />
        <BlurMask blur={24} style="normal" />
      </Circle>
      <Circle cx={f.le.x} cy={f.le.y} r={f.eyeDist * 0.32}>
        <RadialGradient c={vec(f.le.x, f.le.y)} r={f.eyeDist * 0.32} colors={['#FFE0A0', '#FF2D00', 'rgba(255,45,0,0)']} />
        <BlurMask blur={4} style="solid" />
      </Circle>
      <Circle cx={f.re.x} cy={f.re.y} r={f.eyeDist * 0.32}>
        <RadialGradient c={vec(f.re.x, f.re.y)} r={f.eyeDist * 0.32} colors={['#FFE0A0', '#FF2D00', 'rgba(255,45,0,0)']} />
        <BlurMask blur={4} style="solid" />
      </Circle>
      <FlameStack x={hl.x} y={hl.y} size={f.faceW * 0.4} roll={rad - 22 * Math.PI / 180} base={3} clock={clock} />
      <FlameStack x={hr.x} y={hr.y} size={f.faceW * 0.4} roll={rad + 22 * Math.PI / 180} base={6} clock={clock} />
      {Array.from({ length: 10 }).map((_, i) => {
        const sx = off(f, f.eyeMid, f.faceW * 0.4, (rnd(i) - 0.5) * f.faceW);
        return <Drifter key={i} x0={sx.x} y0={sx.y} sway={f.faceW * 0.1} travel={-f.faceW * (0.5 + rnd(i, 2) * 0.5)}
          size={f.faceW * 0.018} dur={1 + rnd(i, 3)} base={rnd(i, 4)} color="#FF5A00" clock={clock} />;
      })}
    </>
  );
}
