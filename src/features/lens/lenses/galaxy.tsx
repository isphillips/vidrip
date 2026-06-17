import React from 'react';
import { Group, Circle, RadialGradient, SweepGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { off, rnd, Sparkle, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// Cosmic nebula: deep-space colour grade + a full starfield, distant nebula clouds, stacked
// counter-rotating sweep-gradient clouds round the face, twinkles, and a pulsing "third eye".
export function Galaxy({ f, clock, w, h }: LensProps) {
  const c = { x: f.nose.x, y: (f.eyeMid.y + f.nose.y) / 2 };
  const R = f.faceW * 1.5;
  const rot = useDerivedValue(() => [{ rotate: clock.value * 0.3 }]);
  const rot2 = useDerivedValue(() => [{ rotate: -clock.value * 0.5 }]);
  const third = useDerivedValue(() => f.faceW * 0.13 * (1 + 0.22 * Math.sin(clock.value * 2.5)));
  const tp = off(f, f.eyeMid, f.faceW * 0.45, 0);
  return (
    <>
      {/* the void: dark space grade + edge vignette */}
      <ScreenTint w={w} h={h} colors={['#1A0840', '#0B0426', '#050111']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(30,8,80,0)', 'rgba(12,4,40,0.45)', 'rgba(3,1,12,0.82)']} />
      {/* distant nebula light */}
      <GlowOrb x={w * 0.2} y={h * 0.2} r={w * 0.5} colors={['rgba(120,60,255,0.35)', 'rgba(60,20,140,0)']} opacity={0.7} blur={40} />
      <GlowOrb x={w * 0.85} y={h * 0.8} r={w * 0.5} colors={['rgba(247,37,133,0.3)', 'rgba(120,10,90,0)']} opacity={0.6} blur={40} />
      {/* starfield (twinkling 4-pt stars, drifting very slowly) */}
      <Motes w={w} h={h} count={40} color="#FFFFFF" clock={clock} dir={-1} sizeMin={1} sizeMax={4} star seed={7} />
      <Circle cx={c.x} cy={c.y} r={R} opacity={0.45}>
        <RadialGradient c={vec(c.x, c.y)} r={R} colors={['#5B0BA3', '#2A0A6E', 'rgba(10,4,30,0)']} />
        <BlurMask blur={24} style="normal" />
      </Circle>
      <Group transform={rot} origin={vec(c.x, c.y)}>
        <Circle cx={c.x} cy={c.y} r={R * 0.78} opacity={0.5}>
          <SweepGradient c={vec(c.x, c.y)} colors={['rgba(67,97,238,0)', '#4361EE', '#F72585', 'rgba(247,37,133,0)', 'rgba(67,97,238,0)']} />
          <BlurMask blur={14} style="normal" />
        </Circle>
      </Group>
      <Group transform={rot2} origin={vec(c.x, c.y)}>
        <Circle cx={c.x} cy={c.y} r={R * 0.52} opacity={0.4}>
          <SweepGradient c={vec(c.x, c.y)} colors={['rgba(124,77,255,0)', '#7C4DFF', '#00E5FF', 'rgba(0,229,255,0)', 'rgba(124,77,255,0)']} />
          <BlurMask blur={10} style="normal" />
        </Circle>
      </Group>
      {Array.from({ length: 18 }).map((_, i) => (
        <Sparkle key={i} x={c.x + (rnd(i) - 0.5) * R * 1.7} y={c.y + (rnd(i, 2) - 0.5) * R * 1.7}
          size={f.faceW * (0.04 + rnd(i, 3) * 0.06)} base={i * 0.7} speed={1.5 + rnd(i, 4) * 2}
          color={i % 3 === 0 ? '#A0F0FF' : '#FFFFFF'} clock={clock} />
      ))}
      <Circle cx={tp.x} cy={tp.y} r={third}>
        <RadialGradient c={vec(tp.x, tp.y)} r={f.faceW * 0.18} colors={['#FFFFFF', '#F72585', 'rgba(247,37,133,0)']} />
        <BlurMask blur={5} style="solid" />
      </Circle>
    </>
  );
}
