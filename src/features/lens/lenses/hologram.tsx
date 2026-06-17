import React from 'react';
import { Group, Circle, RoundedRect, Line, SweepGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

const CYAN = '#39E8FF';

// A reticle ring of tick marks that rotates around the face.
function Reticle({ cx, cy, r, ticks, speed, color, clock }: {
  cx: number; cy: number; r: number; ticks: number; speed: number; color: string; clock: SharedValue<number>;
}) {
  const spin = useDerivedValue(() => [{ rotate: clock.value * speed }]);
  return (
    <Group origin={vec(cx, cy)} transform={spin}>
      <Circle cx={cx} cy={cy} r={r} style="stroke" strokeWidth={Math.max(1.5, r * 0.012)} color={color} opacity={0.7} />
      {Array.from({ length: ticks }).map((_, i) => {
        const a = (i / ticks) * Math.PI * 2;
        const long = i % 4 === 0;
        const r0 = r - (long ? r * 0.09 : r * 0.05);
        return <Line key={i} p1={vec(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)} p2={vec(cx + Math.cos(a) * r, cy + Math.sin(a) * r)}
          style="stroke" strokeWidth={long ? 2.5 : 1.5} color={color} />;
      })}
    </Group>
  );
}

// A holographic projection: cool cyan grade, a projector glow from below, rotating HUD reticles,
// corner brackets, sweeping scanlines, and a constant projection flicker over it all.
export function Hologram({ f, clock, w, h }: LensProps) {
  const c = { x: f.nose.x, y: f.eyeMid.y };
  const flicker = useDerivedValue(() => 0.55 + 0.2 * Math.sin(clock.value * 22) + 0.12 * Math.sin(clock.value * 57));
  const R = f.faceW * 1.15;
  // bracket corners, tilt-aware
  const corners = [
    off(f, c, f.faceW * 0.9, f.faceW * 0.9), off(f, c, f.faceW * 0.9, -f.faceW * 0.9),
    off(f, c, -f.faceW * 0.9, f.faceW * 0.9), off(f, c, -f.faceW * 0.9, -f.faceW * 0.9),
  ];
  const rad = (f.rollDeg * Math.PI) / 180;
  const scan1 = useDerivedValue(() => c.y - R + ((clock.value * 0.5) % 1) * R * 2);
  const scan2 = useDerivedValue(() => c.y - R + ((clock.value * 0.33 + 0.5) % 1) * R * 2);
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#001018', '#012230', '#00060A']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(57,232,255,0)', 'rgba(20,120,150,0.28)', 'rgba(0,8,12,0.82)']} />
      <GlowOrb x={w * 0.5} y={h * 0.96} r={w * 0.9} colors={['rgba(57,232,255,0.3)', 'rgba(0,160,200,0)']} opacity={0.7} blur={40} />
      <Motes w={w} h={h} count={20} color="rgba(120,240,255,0.8)" clock={clock} dir={-1} sizeMin={1} sizeMax={3} seed={41} />

      <Group opacity={flicker}>
        {/* rings */}
        <Reticle cx={c.x} cy={c.y} r={R} ticks={48} speed={0.4} color={CYAN} clock={clock} />
        <Reticle cx={c.x} cy={c.y} r={R * 0.72} ticks={24} speed={-0.6} color="#9BF6FF" clock={clock} />
        {/* accent sweep on the outer ring */}
        <Circle cx={c.x} cy={c.y} r={R} style="stroke" strokeWidth={R * 0.02} opacity={0.5}>
          <SweepGradient c={vec(c.x, c.y)} colors={['rgba(57,232,255,0)', CYAN, 'rgba(57,232,255,0)']} />
          <BlurMask blur={3} style="solid" />
        </Circle>
        {/* corner brackets */}
        {corners.map((p, i) => {
          const sx = i % 2 === 0 ? 1 : -1;   // which way the L opens horizontally
          const sy = i < 2 ? -1 : 1;          // and vertically
          const L = f.faceW * 0.22;
          return (
            <Group key={i} transform={[{ translateX: p.x }, { translateY: p.y }, { rotate: rad }]}>
              <Line p1={vec(0, 0)} p2={vec(sx * L, 0)} style="stroke" strokeWidth={3} color={CYAN} strokeCap="round" />
              <Line p1={vec(0, 0)} p2={vec(0, sy * L)} style="stroke" strokeWidth={3} color={CYAN} strokeCap="round" />
            </Group>
          );
        })}
        {/* scanlines sweeping over the face */}
        <RoundedRect x={c.x - R} y={scan1} width={R * 2} height={3} r={1.5} color="rgba(150,246,255,0.55)" />
        <RoundedRect x={c.x - R} y={scan2} width={R * 2} height={2} r={1} color="rgba(57,232,255,0.4)" />
      </Group>
    </>
  );
}
