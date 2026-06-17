import React from 'react';
import { Group, Path, LinearGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, STAR5, Sparkle, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A spinning, pulsing gold star centered on an eye.
function StarEye({ x, y, size, base, clock }: {
  x: number; y: number; size: number; base: number; clock: SharedValue<number>;
}) {
  const tf = useDerivedValue(() => {
    const pulse = 1 + 0.12 * Math.sin(clock.value * 5 + base);
    return [{ translateX: x }, { translateY: y }, { rotate: clock.value * 1.2 + base }, { scale: size * pulse }];
  });
  return (
    <Group transform={tf}>
      <Path path={STAR5}>
        <LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={['#FFF7C8', '#FFD23C', '#FF9D00']} />
        <BlurMask blur={0.03} style="solid" />
      </Path>
    </Group>
  );
}

// A golden dreamscape: warm twilight grade, a soft starlit glow, a twinkling starfield, big gold
// stars over the eyes, and a ring of twinkles.
export function Starstruck({ f, clock, w, h }: LensProps) {
  const sz = f.eyeDist * 1.05;
  const c = { x: f.nose.x, y: f.eyeMid.y };
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#2A1A00', '#3A2400', '#0E0800']} opacity={0.45} />
      <WorldVignette w={w} h={h} colors={['rgba(255,210,110,0)', 'rgba(120,80,10,0.32)', 'rgba(20,12,0,0.72)']} />
      <GlowOrb x={w * 0.5} y={h * 0.35} r={w * 0.6} colors={['rgba(255,225,140,0.25)', 'rgba(255,180,40,0)']} opacity={0.6} blur={40} />
      <Motes w={w} h={h} count={34} color="#FFE680" clock={clock} dir={-1} sizeMin={1.5} sizeMax={5} star seed={14} />
      <StarEye x={f.le.x} y={f.le.y} size={sz} base={0} clock={clock} />
      <StarEye x={f.re.x} y={f.re.y} size={sz} base={1.6} clock={clock} />
      {Array.from({ length: 9 }).map((_, i) => {
        const a = (i / 9) * Math.PI * 2;
        const p = off(f, c, Math.sin(a) * f.faceW * 0.9, Math.cos(a) * f.faceW * 0.9);
        return <Sparkle key={i} x={p.x} y={p.y} size={f.faceW * (0.05 + rnd(i) * 0.04)} base={i * 0.8} speed={3 + rnd(i, 2) * 3} color={i % 2 ? '#FFE680' : '#FFFFFF'} clock={clock} />;
      })}
    </>
  );
}
