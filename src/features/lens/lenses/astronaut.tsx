import React from 'react';
import { Group, Circle, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { sample } from './_meshKit';
import { Sparkle, ScreenTint, WorldVignette, Bloom, Motes, rnd, type LensProps } from '../core';

// Astronaut: a clear bubble space-helmet anchored to the head (transparent dome + reflection streaks
// so the eyes read through), floating in a starfield with an Earth-glow and drifting space dust off
// the mesh.
export function Astronaut({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const roll = (f.rollDeg * Math.PI) / 180;
  const tf = [{ translateX: f.eyeMid.x }, { translateY: f.eyeMid.y }, { rotate: roll }, { scale: f.faceW }];
  const R = 1.15; // dome radius (local / faceW units)
  const shine = Skia.Path.Make();
  shine.moveTo(-0.62, -0.7); shine.lineTo(-0.22, -0.86); shine.lineTo(-0.46, -0.2); shine.lineTo(-0.8, -0.06); shine.close();
  const shine2 = Skia.Path.Make();
  shine2.moveTo(-0.12, -0.8); shine2.lineTo(0.0, -0.82); shine2.lineTo(-0.2, -0.2); shine2.lineTo(-0.32, -0.22); shine2.close();
  const dust = sample(f.meshPts, 14);
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#05010F', '#0A0524', '#02010A']} opacity={0.55} />
      <WorldVignette w={w} h={h} colors={['rgba(40,20,90,0)', 'rgba(10,5,40,0.5)', 'rgba(2,1,10,0.9)']} />
      <Motes w={w} h={h} count={50} color="#FFFFFF" clock={clock} dir={-1} sizeMin={1} sizeMax={3} star seed={9} />
      <Bloom x={w * 0.82} y={h * 0.82} r={w * 0.5} inner="rgba(90,160,255,0.5)" outer="rgba(20,60,160,0)" opacity={0.7} />
      {dust.map((p, i) => (
        <Sparkle key={i} x={p.x} y={p.y} size={f.faceW * (0.03 + 0.03 * rnd(i))} base={i} speed={1.2 + rnd(i, 2) * 2}
          color={i % 3 ? '#BFE0FF' : '#FFFFFF'} clock={clock} />
      ))}
      <Group transform={tf}>
        {/* clear visor glass — face reads straight through */}
        <Circle cx={0} cy={-0.05} r={R}>
          <RadialGradient c={vec(-0.32, -0.42)} r={R * 1.7} colors={['rgba(185,225,255,0.13)', 'rgba(70,120,190,0.09)', 'rgba(20,40,90,0.2)']} />
        </Circle>
        {/* reflection streaks */}
        <Path path={shine} color="rgba(255,255,255,0.3)" />
        <Path path={shine2} color="rgba(255,255,255,0.22)" />
        {/* helmet shell rim + metallic trim */}
        <Circle cx={0} cy={-0.05} r={R + 0.07} style="stroke" strokeWidth={0.16} color="#E9EEF5" />
        <Circle cx={0} cy={-0.05} r={R} style="stroke" strokeWidth={0.04} color="#9AA6B4" />
        {/* antenna light */}
        <Circle cx={0.7} cy={-R - 0.04} r={0.07} color="#FF4D6D" />
        <Circle cx={0.7} cy={-R - 0.04} r={0.03} color="#FFD0D8" />
      </Group>
    </>
  );
}
