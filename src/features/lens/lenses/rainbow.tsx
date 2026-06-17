import React from 'react';
import { Group, Circle, SweepGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { rnd, Sparkle, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A dreamy prism world: soft pastel grade, two corner light prisms, floating bokeh, and twin
// counter-rotating rainbow rings haloing the face.
export function RainbowAura({ f, clock, w, h }: LensProps) {
  const c = { x: f.nose.x, y: (f.eyeMid.y + f.mouth.y) / 2 };
  const rot = useDerivedValue(() => [{ rotate: clock.value * 0.6 }]);
  const rot2 = useDerivedValue(() => [{ rotate: -clock.value * 0.9 }]);
  const R = useDerivedValue(() => f.faceW * 1.05 * (1 + 0.05 * Math.sin(clock.value * 2)));
  const R2 = useDerivedValue(() => f.faceW * 1.3 * (1 + 0.04 * Math.sin(clock.value * 2 + 1)));
  const sw = useDerivedValue(() => f.faceW * 0.12 * (1 + 0.2 * Math.sin(clock.value * 2.5)));
  const rainbow = ['#FF004D', '#FF8A00', '#FFE600', '#00E676', '#00B0FF', '#7C4DFF', '#FF004D'];
  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(255,220,245,0.4)', 'rgba(220,235,255,0.12)', 'rgba(225,255,240,0.35)']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(255,255,255,0)', 'rgba(255,210,240,0.2)', 'rgba(180,210,255,0.45)']} />
      <GlowOrb x={w * 0.15} y={h * 0.18} r={w * 0.45} colors={['rgba(255,120,200,0.3)', 'rgba(255,120,200,0)']} opacity={0.7} blur={40} />
      <GlowOrb x={w * 0.85} y={h * 0.82} r={w * 0.45} colors={['rgba(120,200,255,0.3)', 'rgba(120,200,255,0)']} opacity={0.7} blur={40} />
      <Motes w={w} h={h} count={20} color="rgba(255,255,255,0.85)" clock={clock} dir={-1} sizeMin={2} sizeMax={6} seed={8} />
      <Group transform={rot} origin={vec(c.x, c.y)}>
        <Circle cx={c.x} cy={c.y} r={R} style="stroke" strokeWidth={sw}>
          <SweepGradient c={vec(c.x, c.y)} colors={rainbow} />
          <BlurMask blur={6} style="solid" />
        </Circle>
      </Group>
      <Group transform={rot2} origin={vec(c.x, c.y)}>
        <Circle cx={c.x} cy={c.y} r={R2} style="stroke" strokeWidth={sw} opacity={0.6}>
          <SweepGradient c={vec(c.x, c.y)} colors={rainbow} />
          <BlurMask blur={8} style="normal" />
        </Circle>
      </Group>
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return <Sparkle key={i} x={c.x + Math.cos(a) * f.faceW * 1.15} y={c.y + Math.sin(a) * f.faceW * 1.15}
          size={f.faceW * 0.07} base={i * 0.8} speed={2 + rnd(i)} color="#FFFFFF" clock={clock} />;
      })}
    </>
  );
}
