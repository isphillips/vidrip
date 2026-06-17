import React from 'react';
import { Group, Circle, Path, LinearGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, TEARDROP, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A single teardrop that wells up under an eye, then streams down the cheek along the face-down axis,
// fading near the end, on a loop.
function Tear({ ex, ey, dx, dy, size, dur, base, clock }: {
  ex: number; ey: number; dx: number; dy: number; size: number; dur: number; base: number; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const tf = useDerivedValue(() => {
    const t = v.value;
    const grow = t < 0.15 ? t / 0.15 : 1;            // swell at the lid
    return [{ translateX: ex + dx * t }, { translateY: ey + dy * t }, { scale: size * grow }];
  });
  const op = useDerivedValue(() => (v.value > 0.8 ? (1 - v.value) / 0.2 : 1));
  return (
    <Group transform={tf} opacity={op}>
      <Path path={TEARDROP}>
        <LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={['#DFF6FF', '#7CC8FF', '#2E8BE0']} />
        <BlurMask blur={0.04} style="solid" />
      </Path>
      {/* wet highlight */}
      <Circle cx={-0.12} cy={0.12} r={0.08} color="rgba(255,255,255,0.8)" />
    </Group>
  );
}

// A rainy, melancholy world: cold blue grade, a gloomy vignette, a soft window-light glow, a
// full-screen downpour, glossy welled eyes, and tear streams down each cheek.
export function Tears({ f, clock, w, h }: LensProps) {
  // Down-the-cheek vector = the face-DOWN axis (opposite up), nudged slightly outward.
  const fall = f.faceW * 0.9;
  const dropL = { dx: -f.up.x * fall + f.along.x * f.faceW * 0.12, dy: -f.up.y * fall + f.along.y * f.faceW * 0.12 };
  const dropR = { dx: -f.up.x * fall - f.along.x * f.faceW * 0.12, dy: -f.up.y * fall - f.along.y * f.faceW * 0.12 };
  const lid = (eye: typeof f.le) => off(f, eye, -f.eyeDist * 0.32, 0); // just below the eye
  const ll = lid(f.le), lr = lid(f.re);
  const sz = f.eyeDist * 0.5;
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#0E2436', '#163A56', '#08161F']} opacity={0.42} />
      <WorldVignette w={w} h={h} colors={['rgba(40,90,130,0)', 'rgba(20,55,85,0.4)', 'rgba(5,18,28,0.8)']} />
      <GlowOrb x={w * 0.5} y={h * 0.2} r={w * 0.6} colors={['rgba(150,200,235,0.28)', 'rgba(90,140,190,0)']} opacity={0.6} blur={40} />
      {/* downpour */}
      <Motes w={w} h={h} count={34} color="rgba(180,220,250,0.7)" clock={clock} dir={1} sizeMin={1} sizeMax={3} seed={13} />
      {/* glossy sheen over each eye */}
      <Circle cx={f.le.x} cy={f.le.y} r={f.eyeDist * 0.3} color="rgba(180,225,255,0.35)"><BlurMask blur={4} style="normal" /></Circle>
      <Circle cx={f.re.x} cy={f.re.y} r={f.eyeDist * 0.3} color="rgba(180,225,255,0.35)"><BlurMask blur={4} style="normal" /></Circle>
      {[0, 0.5].map((b, i) => (
        <Tear key={`l${i}`} ex={ll.x} ey={ll.y} dx={dropL.dx} dy={dropL.dy} size={sz} dur={2.2} base={b} clock={clock} />
      ))}
      {[0.25, 0.75].map((b, i) => (
        <Tear key={`r${i}`} ex={lr.x} ey={lr.y} dx={dropR.dx} dy={dropR.dy} size={sz} dur={2.2} base={b} clock={clock} />
      ))}
    </>
  );
}
