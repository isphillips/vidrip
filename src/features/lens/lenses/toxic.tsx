import React from 'react';
import { Group, Circle, RadialGradient, SweepGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { off, rnd, Drifter, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A radioactive wasteland: sickly green murk, an eerie acid glow, floating toxic spores, a rotating
// toxic ring, glowing acid eyes, and rising goo.
export function Toxic({ f, clock, w, h }: LensProps) {
  const c = { x: f.nose.x, y: f.eyeMid.y };
  const rot = useDerivedValue(() => [{ rotate: clock.value * 0.4 }]);
  const pulse = useDerivedValue(() => f.faceW * 1.2 * (1 + 0.05 * Math.sin(clock.value * 3)));
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#10240A', '#244A0E', '#060F04']} opacity={0.45} />
      <WorldVignette w={w} h={h} colors={['rgba(120,220,30,0)', 'rgba(70,140,10,0.35)', 'rgba(10,28,2,0.82)']} />
      <GlowOrb x={w * 0.5} y={h * 0.5} r={w * 0.7} colors={['rgba(156,255,46,0.22)', 'rgba(60,160,0,0)']} opacity={0.7} blur={44} />
      <Motes w={w} h={h} count={24} color="rgba(170,255,80,0.85)" clock={clock} dir={-1} sizeMin={1.5} sizeMax={5} seed={15} />
      <Circle cx={c.x} cy={c.y} r={f.faceW * 1.3} opacity={0.32}>
        <RadialGradient c={vec(c.x, c.y)} r={f.faceW * 1.3} colors={['#9CFF2E', 'rgba(40,160,0,0)']} />
        <BlurMask blur={26} style="normal" />
      </Circle>
      <Group transform={rot} origin={vec(c.x, c.y)}>
        <Circle cx={c.x} cy={c.y} r={pulse} style="stroke" strokeWidth={f.faceW * 0.08} opacity={0.55}>
          <SweepGradient c={vec(c.x, c.y)} colors={['rgba(156,255,46,0)', '#9CFF2E', '#3DFF88', 'rgba(61,255,136,0)', 'rgba(156,255,46,0)']} />
          <BlurMask blur={8} style="normal" />
        </Circle>
      </Group>
      {/* acid-glow eyes */}
      <Circle cx={f.le.x} cy={f.le.y} r={f.eyeDist * 0.3}>
        <RadialGradient c={vec(f.le.x, f.le.y)} r={f.eyeDist * 0.3} colors={['#EAFFB0', '#7CFF1E', 'rgba(124,255,30,0)']} />
        <BlurMask blur={4} style="solid" />
      </Circle>
      <Circle cx={f.re.x} cy={f.re.y} r={f.eyeDist * 0.3}>
        <RadialGradient c={vec(f.re.x, f.re.y)} r={f.eyeDist * 0.3} colors={['#EAFFB0', '#7CFF1E', 'rgba(124,255,30,0)']} />
        <BlurMask blur={4} style="solid" />
      </Circle>
      {Array.from({ length: 14 }).map((_, i) => {
        const sx = off(f, f.eyeMid, -f.faceW * 0.4, (rnd(i) - 0.5) * f.faceW * 1.6);
        return <Drifter key={i} x0={sx.x} y0={sx.y} sway={f.faceW * 0.12} travel={-f.faceW * (0.8 + rnd(i, 2) * 0.6)}
          size={f.faceW * (0.02 + rnd(i, 3) * 0.04)} dur={1.8 + rnd(i, 4) * 1.8} base={rnd(i, 5)} color={i % 2 ? '#9CFF2E' : '#3DFF88'} clock={clock} />;
      })}
    </>
  );
}
