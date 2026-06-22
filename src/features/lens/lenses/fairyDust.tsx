import React from 'react';
import { Circle, BlurMask } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, Sparkle, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A glowing pixie that orbits the face on a tilted ellipse, leaving a soft light trail.
function Pixie({ cx, cy, rx, ry, base, speed, size, color, clock }: {
  cx: number; cy: number; rx: number; ry: number; base: number; speed: number; size: number; color: string; clock: SharedValue<number>;
}) {
  const px = useDerivedValue(() => cx + Math.cos(clock.value * speed + base) * rx);
  const py = useDerivedValue(() => cy + Math.sin(clock.value * speed + base) * ry);
  const tw = useDerivedValue(() => size * (0.7 + 0.3 * Math.sin(clock.value * 5 + base)));
  return (
    <Circle cx={px} cy={py} r={tw} color={color}>
      <BlurMask blur={3} style="solid" />
    </Circle>
  );
}

// An enchanted glade: dusky teal-violet grade, a magical glow, drifting fireflies, swirling pixies
// orbiting the head, and a shower of golden fairy dust.
export function FairyDust({ f, clock, w, h }: LensProps) {
  const c = { x: f.nose.x, y: f.eyeMid.y };
  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(20,50,55,0.45)', 'rgba(40,30,70,0.15)', 'rgba(10,25,30,0.45)']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(120,255,210,0)', 'rgba(60,140,120,0.28)', 'rgba(15,30,35,0.7)']} />
      <GlowOrb x={w * 0.5} y={h * 0.42} r={w * 0.65} colors={['rgba(160,255,220,0.22)', 'rgba(80,200,160,0)']} opacity={0.6} blur={40} />
      {/* fireflies + golden dust */}
      <Motes w={w} h={h} count={26} color="rgba(190,255,200,0.9)" clock={clock} dir={-1} sizeMin={1.5} sizeMax={4.5} seed={21} />
      {/* pixies orbiting the head */}
      {Array.from({ length: 5 }).map((_, i) => (
        <Pixie key={i} cx={c.x} cy={c.y} rx={f.faceW * (0.85 + (i % 2) * 0.25)} ry={f.faceW * (0.6 + (i % 2) * 0.2)}
          base={(i / 5) * Math.PI * 2} speed={0.9 + (i % 3) * 0.25} size={f.faceW * (0.05 + rnd(i) * 0.03)}
          color={['#E7FFB0', '#B0FFE0', '#FFE9A0', '#C8F0FF', '#FFD0F0'][i % 5]} clock={clock} />
      ))}
      {/* fairy-dust shower around the face */}
      {Array.from({ length: 14 }).map((_, i) => {
        const p = off(f, f.eyeMid, f.faceW * (0.3 + rnd(i) * 0.7), (rnd(i, 2) - 0.5) * f.faceW * 1.8);
        return <Sparkle key={i} x={p.x} y={p.y} size={f.faceW * (0.04 + rnd(i, 3) * 0.04)} base={i * 0.7} speed={3 + rnd(i, 4) * 3} color={i % 2 ? '#FFF0B0' : '#D8FFE8'} clock={clock} />;
      })}
    </>
  );
}
