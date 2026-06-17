import React from 'react';
import { Group, Circle, RadialGradient, SweepGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { off, rnd, Drifter, ScreenTint, WorldVignette, GodRays, Motes, type LensProps } from '../core';

// The heavens: a soft golden-white bloom, divine light pouring from above, drifting feathers/motes,
// a glowing halo, and rising sparkles.
export function Angel({ f, clock, w, h }: LensProps) {
  const halo = off(f, f.eyeMid, f.faceW * 0.95, 0);
  const ringR = useDerivedValue(() => f.faceW * 0.45 * (1 + 0.03 * Math.sin(clock.value * 2)));
  const bob = useDerivedValue(() => [{ translateY: Math.sin(clock.value * 1.5) * f.faceW * 0.03 }]);
  const c = { x: f.nose.x, y: f.eyeMid.y };
  return (
    <>
      {/* heavenly bloom: warm white wash, brighter at the top, soft gold edges */}
      <ScreenTint w={w} h={h} colors={['rgba(255,250,225,0.55)', 'rgba(255,240,200,0.15)', 'rgba(255,235,180,0.35)']} opacity={0.6} />
      <WorldVignette w={w} h={h} colors={['rgba(255,250,220,0)', 'rgba(255,240,190,0.25)', 'rgba(255,225,150,0.5)']} />
      <GodRays w={w} h={h} x={w * 0.5} y={-h * 0.1} color="rgba(255,248,210,0.6)" count={7} spread={1.3} clock={clock} opacity={0.5} />
      <Motes w={w} h={h} count={18} color="rgba(255,250,225,0.9)" clock={clock} dir={1} sizeMin={1.5} sizeMax={4} star seed={4} />
      <Circle cx={c.x} cy={c.y} r={f.faceW * 1.3} opacity={0.35}>
        <RadialGradient c={vec(c.x, c.y)} r={f.faceW * 1.3} colors={['#FFF6CF', 'rgba(255,240,180,0)']} />
        <BlurMask blur={26} style="normal" />
      </Circle>
      <Group transform={bob}>
        <Circle cx={halo.x} cy={halo.y} r={ringR} style="stroke" strokeWidth={f.faceW * 0.1}>
          <SweepGradient c={vec(halo.x, halo.y)} colors={['#FFE680', '#FFFBE0', '#FFC93C', '#FFFBE0', '#FFE680']} />
          <BlurMask blur={6} style="solid" />
        </Circle>
      </Group>
      {Array.from({ length: 12 }).map((_, i) => {
        const sx = off(f, f.eyeMid, -f.faceW * 0.2, (rnd(i) - 0.5) * f.faceW * 1.4);
        return <Drifter key={i} x0={sx.x} y0={sx.y} sway={f.faceW * 0.1} travel={-f.faceW * (0.7 + rnd(i, 2) * 0.5)}
          size={f.faceW * 0.05} dur={2 + rnd(i, 3) * 1.5} base={rnd(i, 4)} color={i % 2 ? '#FFF6CF' : '#FFFFFF'} clock={clock} star />;
      })}
    </>
  );
}
