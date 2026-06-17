import React from 'react';
import { Group, Circle, Path, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { rnd, BOLTS, Sparkle, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A flickering lightning bolt, oriented outward from a ring around the face.
function Bolt({ x, y, len, angle, idx, base, clock }: {
  x: number; y: number; len: number; angle: number; idx: number; base: number; clock: SharedValue<number>;
}) {
  const op = useDerivedValue(() => (Math.sin(clock.value * 12 + base) > 0.3 ? 0.9 : 0.12));
  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { rotate: angle }, { scaleX: len }, { scaleY: len }]} opacity={op}>
      <Path path={BOLTS[idx % BOLTS.length]} style="stroke" strokeWidth={0.045} color="#9FE8FF" strokeCap="round">
        <BlurMask blur={0.05} style="solid" />
      </Path>
    </Group>
  );
}

// A storm world: dark charged grade, electric-blue haze pulsing at the edges, floating sparks, and a
// ring of lightning bolts crackling outward from the face.
export function Electric({ f, clock, w, h }: LensProps) {
  const c = { x: f.nose.x, y: f.eyeMid.y };
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#05101F', '#0A2A52', '#02060F']} opacity={0.45} />
      <WorldVignette w={w} h={h} colors={['rgba(0,120,255,0)', 'rgba(0,80,200,0.3)', 'rgba(0,10,30,0.82)']} />
      <GlowOrb x={w * 0.5} y={h * 0.45} r={w * 0.7} colors={['rgba(60,227,255,0.22)', 'rgba(0,80,255,0)']} opacity={0.7} blur={42} />
      <Motes w={w} h={h} count={20} color="#BFF7FF" clock={clock} dir={-1} sizeMin={1} sizeMax={3.5} star seed={9} />
      <Circle cx={c.x} cy={c.y} r={f.faceW * 1.15} opacity={0.3}>
        <RadialGradient c={vec(c.x, c.y)} r={f.faceW * 1.15} colors={['#3AE3FF', 'rgba(0,80,255,0)']} />
        <BlurMask blur={20} style="normal" />
      </Circle>
      {Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2;
        const bx = c.x + Math.cos(a) * f.faceW * 0.95;
        const by = c.y + Math.sin(a) * f.faceW * 0.95;
        return <Bolt key={i} x={bx} y={by} len={f.faceW * 0.7} angle={a + Math.PI / 2} idx={i} base={i * 1.3} clock={clock} />;
      })}
      {Array.from({ length: 10 }).map((_, i) => {
        const a = rnd(i) * Math.PI * 2;
        const r = f.faceW * (0.6 + rnd(i, 2) * 0.6);
        return <Sparkle key={`s${i}`} x={c.x + Math.cos(a) * r} y={c.y + Math.sin(a) * r} size={f.faceW * 0.05} base={i} speed={6 + rnd(i, 3) * 4} color="#BFF7FF" clock={clock} />;
      })}
    </>
  );
}
