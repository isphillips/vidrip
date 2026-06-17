import React from 'react';
import { Group, Circle, SweepGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { off, rnd, Drifter, ScreenTint, WorldVignette, Motes, type LensProps } from '../core';

// A nightclub: dark room with swirling coloured spotlight beams sweeping from above, confetti rain,
// and a spinning multi-colour light-ray disc behind the head.
export function Disco({ f, clock, w, h }: LensProps) {
  const c = { x: f.nose.x, y: f.eyeMid.y };
  const rot = useDerivedValue(() => [{ rotate: clock.value * 0.8 }]);
  // Coloured club beams sweeping from the ceiling — a rotating fan of sweep-gradient wedges.
  const sweep1 = useDerivedValue(() => [{ rotate: clock.value * 0.5 }]);
  const sweep2 = useDerivedValue(() => [{ rotate: -clock.value * 0.35 }]);
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#0B0118', '#13002A', '#050009']} opacity={0.55} />
      <WorldVignette w={w} h={h} colors={['rgba(40,0,80,0)', 'rgba(20,0,50,0.4)', 'rgba(2,0,8,0.85)']} />
      {/* spotlight fans from the ceiling */}
      <Group transform={sweep1} origin={vec(w * 0.5, 0)}>
        <Circle cx={w * 0.5} cy={0} r={Math.hypot(w, h)} opacity={0.22}>
          <SweepGradient c={vec(w * 0.5, 0)} colors={['rgba(255,0,200,0)', '#FF00C8', 'rgba(255,0,200,0)', 'rgba(0,229,255,0)', '#00E5FF', 'rgba(0,229,255,0)', 'rgba(255,0,200,0)']} />
          <BlurMask blur={30} style="normal" />
        </Circle>
      </Group>
      <Group transform={sweep2} origin={vec(w * 0.5, 0)}>
        <Circle cx={w * 0.5} cy={0} r={Math.hypot(w, h)} opacity={0.18}>
          <SweepGradient c={vec(w * 0.5, 0)} colors={['rgba(255,230,0,0)', '#FFE600', 'rgba(255,230,0,0)', 'rgba(0,255,148,0)', '#00FF94', 'rgba(0,255,148,0)', 'rgba(255,230,0,0)']} />
          <BlurMask blur={30} style="normal" />
        </Circle>
      </Group>
      <Motes w={w} h={h} count={26} color="#FFFFFF" clock={clock} dir={1} sizeMin={2} sizeMax={6} star seed={1} />
      <Group transform={rot} origin={vec(c.x, c.y)}>
        <Circle cx={c.x} cy={c.y} r={f.faceW * 1.6} opacity={0.4}>
          <SweepGradient c={vec(c.x, c.y)} colors={['rgba(255,0,200,0)', '#FF00C8', 'rgba(255,0,200,0)', '#00E5FF', 'rgba(0,229,255,0)', '#FFE600', 'rgba(255,230,0,0)', '#00FF94', 'rgba(0,255,148,0)', 'rgba(255,0,200,0)']} />
          <BlurMask blur={12} style="normal" />
        </Circle>
      </Group>
      {Array.from({ length: 18 }).map((_, i) => {
        const sx = off(f, f.eyeMid, f.faceW * 0.8, (rnd(i) - 0.5) * f.faceW * 2);
        return <Drifter key={i} x0={sx.x} y0={sx.y} sway={f.faceW * 0.16} travel={f.faceW * (1 + rnd(i, 2) * 0.8)}
          size={f.faceW * 0.04} dur={2 + rnd(i, 3) * 2} base={rnd(i, 4)} color={['#FF00C8', '#00E5FF', '#FFE600', '#00FF94', '#FF5AF0'][i % 5]} clock={clock} star />;
      })}
    </>
  );
}
