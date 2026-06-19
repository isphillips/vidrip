import React from 'react';
import { Group, Circle, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { off, FlameStack, EmberField, Smoke, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// An underworld: oppressive crimson dark closing in from the edges, a pulsing blood glow, drifting
// embers, glowing red eyes, and flaming horns trailing dark smoke.
export function Demon({ f, clock, w, h }: LensProps) {
  const rad = (f.rollDeg * Math.PI) / 180;
  const hl = off(f, f.le, f.faceW * 0.55, -f.faceW * 0.12);
  const hr = off(f, f.re, f.faceW * 0.55, f.faceW * 0.12);
  const c = { x: f.nose.x, y: f.eyeMid.y };
  // Slow demonic breathing of the blood glow + a faster ember flicker for the firelight.
  const breath = useDerivedValue(() => 0.6 + 0.4 * Math.abs(Math.sin(clock.value * 1.4)));
  const flick = useDerivedValue(() => 0.55 + 0.3 * Math.abs(Math.sin(clock.value * 8)) + 0.15 * Math.sin(clock.value * 17));
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#1A0000', '#3A0400', '#0C0000']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(120,0,0,0)', 'rgba(70,0,0,0.5)', 'rgba(10,0,0,0.9)']} />
      <Group opacity={breath}>
        <GlowOrb x={w * 0.5} y={h * 0.5} r={w * 0.6} colors={['rgba(180,0,0,0.25)', 'rgba(60,0,0,0)']} opacity={0.7} blur={44} />
      </Group>
      <Motes w={w} h={h} count={22} color="#FF4400" clock={clock} dir={-1} sizeMin={1.5} sizeMax={4.5} seed={5} />
      {/* smoke trailing off the horns */}
      <Smoke x={hl.x} y={hl.y} count={3} size={f.faceW * 0.34} travel={-f.faceW * 1.8} color="rgba(30,8,8,0.6)" seed={1} clock={clock} />
      <Smoke x={hr.x} y={hr.y} count={3} size={f.faceW * 0.34} travel={-f.faceW * 1.8} color="rgba(30,8,8,0.6)" seed={9} clock={clock} />
      <Group opacity={flick}>
        <Circle cx={c.x} cy={c.y} r={f.faceW * 1.2} opacity={0.32}>
          <RadialGradient c={vec(c.x, c.y)} r={f.faceW * 1.2} colors={['#FF1E00', 'rgba(120,0,0,0)']} />
          <BlurMask blur={24} style="normal" />
        </Circle>
      </Group>
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
      {/* embers streaming off each flaming horn */}
      <EmberField x={hl.x} y={hl.y} width={f.faceW * 0.6} count={11} rise={f.faceW * 2} size={f.faceW * 0.026} clock={clock} seed={3} />
      <EmberField x={hr.x} y={hr.y} width={f.faceW * 0.6} count={11} rise={f.faceW * 2} size={f.faceW * 0.026} clock={clock} seed={8} />
    </>
  );
}
