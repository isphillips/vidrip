import React from 'react';
import { Group, Circle, Path, Skia, RadialGradient, BlurMask, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, Drifter, ScreenTint, WorldVignette, type LensProps } from '../core';

// Unit sun-ray: a tapering blade, apex outward at y=-1, base at the centre.
const RAY: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(-0.05, 0); p.lineTo(0, -1); p.lineTo(0.05, 0); p.close();
  return p;
})();

// A rotating corona of rays around a centre. Rays alternate long/short for a sunburst.
function Corona({ cx, cy, count, len, speed, colors, clock }: {
  cx: number; cy: number; count: number; len: number; speed: number; colors: string[]; clock: SharedValue<number>;
}) {
  const spin = useDerivedValue(() => [{ rotate: clock.value * speed }]);
  return (
    <Group origin={vec(cx, cy)} transform={spin}>
      {Array.from({ length: count }).map((_, i) => {
        const a = ((i / count) * Math.PI * 2);
        const long = i % 2 === 0 ? 1 : 0.62;
        return (
          <Group key={i} origin={vec(cx, cy)} transform={[{ translateX: cx }, { translateY: cy }, { rotate: a }, { scaleX: len * 0.16 }, { scaleY: len * long }]}>
            <Path path={RAY}>
              <RadialGradient c={vec(0, 0)} r={1} colors={colors} />
            </Path>
          </Group>
        );
      })}
    </Group>
  );
}

// A blazing sun world: hot golden bloom, twin counter-rotating coronas behind the head, a bright
// solar disc, and licking solar flares.
export function Solar({ f, clock, w, h }: LensProps) {
  const c = { x: f.nose.x, y: f.eyeMid.y };
  const discR = useDerivedValue(() => f.faceW * 0.95 * (1 + 0.03 * Math.sin(clock.value * 2.5)));
  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(70,40,0,0.45)', 'rgba(150,80,0,0.18)', 'rgba(50,20,0,0.4)']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(255,180,40,0)', 'rgba(200,90,0,0.32)', 'rgba(40,15,0,0.72)']} />
      {/* corona rays */}
      <Corona cx={c.x} cy={c.y} count={28} len={f.faceW * 2.0} speed={0.18} colors={['#FFF3B0', '#FFB000', 'rgba(255,90,0,0)']} clock={clock} />
      <Corona cx={c.x} cy={c.y} count={20} len={f.faceW * 1.6} speed={-0.26} colors={['#FFE070', '#FF7A00', 'rgba(220,40,0,0)']} clock={clock} />
      {/* solar disc bloom behind the head */}
      <Circle cx={c.x} cy={c.y} r={f.faceW * 1.3} opacity={0.4}>
        <RadialGradient c={vec(c.x, c.y)} r={f.faceW * 1.3} colors={['#FFF6D0', '#FFA000', 'rgba(255,90,0,0)']} />
        <BlurMask blur={28} style="normal" />
      </Circle>
      <Circle cx={c.x} cy={c.y} r={discR} opacity={0.32}>
        <RadialGradient c={vec(c.x, c.y)} r={f.faceW} colors={['rgba(255,240,180,0.5)', 'rgba(255,150,0,0)']} />
      </Circle>
      {/* solar flares licking outward */}
      {Array.from({ length: 14 }).map((_, i) => {
        const a = (i / 14) * Math.PI * 2;
        const sx = c.x + Math.cos(a) * f.faceW * 0.95;
        const sy = c.y + Math.sin(a) * f.faceW * 0.95;
        return <Drifter key={i} x0={sx} y0={sy} sway={f.faceW * 0.08} travel={-f.faceW * (0.5 + rnd(i, 2) * 0.5)}
          size={f.faceW * (0.02 + rnd(i, 3) * 0.025)} dur={1 + rnd(i, 4) * 1.2} base={rnd(i, 5)} color={i % 2 ? '#FFC93C' : '#FF6B00'} clock={clock} />;
      })}
    </>
  );
}
