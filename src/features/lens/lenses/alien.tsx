import React from 'react';
import { Group, Circle, Path, Line, Skia, LinearGradient, RadialGradient, BlurMask, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, ScreenTint, WorldVignette, Motes, type LensProps } from '../core';

// Unit tractor-beam: narrow at the saucer (y=0), widening to a base at y=1 (half-width 0.5).
const BEAM_TRI: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(-0.12, 0); p.lineTo(-0.5, 1); p.lineTo(0.5, 1); p.lineTo(0.12, 0); p.close();
  return p;
})();

// A bobbing antenna: a thin stalk topped with a pulsing glow orb.
function Antenna({ baseX, baseY, ux, uy, len, clock, base }: {
  baseX: number; baseY: number; ux: number; uy: number; len: number; clock: SharedValue<number>; base: number;
}) {
  const cx = useDerivedValue(() => baseX + ux * len + Math.sin(clock.value * 2.4 + base) * len * 0.12);
  const cy = useDerivedValue(() => baseY + uy * len + Math.cos(clock.value * 2.0 + base) * len * 0.12);
  const tip = useDerivedValue(() => vec(cx.value, cy.value));
  const orb = useDerivedValue(() => len * 0.22 * (1 + 0.2 * Math.sin(clock.value * 6 + base)));
  return (
    <>
      <Line p1={vec(baseX, baseY)} p2={tip} style="stroke" strokeWidth={Math.max(2, len * 0.05)} color="#2A3A2E" strokeCap="round" />
      <Circle cx={cx} cy={cy} r={orb}>
        <RadialGradient c={vec(baseX, baseY)} r={len * 0.3} colors={['#EAFFD0', '#7CFF3C', 'rgba(124,255,60,0)']} />
        <BlurMask blur={3} style="solid" />
      </Circle>
    </>
  );
}

// One pulsing light on the saucer's underside.
function SaucerLight({ x, y, r, color, base, clock }: {
  x: number; y: number; r: number; color: string; base: number; clock: SharedValue<number>;
}) {
  const op = useDerivedValue(() => 0.4 + 0.6 * Math.abs(Math.sin(clock.value * 4 + base)));
  return <Circle cx={x} cy={y} r={r} opacity={op} color={color}><BlurMask blur={3} style="solid" /></Circle>;
}

// An abduction scene: starry sci-fi grade, a hovering UFO above the head firing a pulsing green
// tractor beam, wobbling antennae, and an alien-green glow on the face.
export function Alien({ f, clock, w, h }: LensProps) {
  const rad = (f.rollDeg * Math.PI) / 180;
  const saucer = off(f, f.eyeMid, f.faceW * 1.45, 0);
  const sW = f.faceW * 1.5;
  const beam = useDerivedValue(() => 0.4 + 0.25 * Math.sin(clock.value * 2.5));
  const hover = useDerivedValue(() => [{ translateY: Math.sin(clock.value * 1.4) * f.faceW * 0.04 }]);
  const aL = off(f, f.eyeMid, f.faceW * 0.6, f.faceW * 0.26);
  const aR = off(f, f.eyeMid, f.faceW * 0.6, -f.faceW * 0.26);
  const lightColors = ['#FF4FD8', '#FFE600', '#46E0FF', '#7CFF3C', '#FF7A4F'];
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#02100A', '#06301E', '#010805']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(60,255,150,0)', 'rgba(20,120,60,0.3)', 'rgba(1,12,6,0.85)']} />
      <Motes w={w} h={h} count={34} color="rgba(200,255,210,0.85)" clock={clock} dir={-1} sizeMin={1} sizeMax={3} star seed={31} />

      {/* alien-green glow on the face */}
      <Circle cx={f.nose.x} cy={f.eyeMid.y} r={f.faceW * 1.1} opacity={0.28}>
        <RadialGradient c={vec(f.nose.x, f.eyeMid.y)} r={f.faceW * 1.1} colors={['#9CFF6B', 'rgba(60,200,40,0)']} />
        <BlurMask blur={22} style="normal" />
      </Circle>

      {/* antennae */}
      <Antenna baseX={aL.x} baseY={aL.y} ux={f.up.x * 0.5 + f.along.x} uy={f.up.y * 0.5 + f.along.y} len={f.faceW * 0.5} clock={clock} base={0} />
      <Antenna baseX={aR.x} baseY={aR.y} ux={f.up.x * 0.5 - f.along.x} uy={f.up.y * 0.5 - f.along.y} len={f.faceW * 0.5} clock={clock} base={1.7} />

      <Group transform={hover}>
        {/* tractor beam (behind the saucer body) */}
        <Group transform={[{ translateX: saucer.x }, { translateY: saucer.y }, { rotate: rad }, { scaleX: f.faceW * 1.8 }, { scaleY: f.faceW * 1.7 }]} opacity={beam}>
          <Path path={BEAM_TRI}>
            <LinearGradient start={vec(0, 0)} end={vec(0, 1)} colors={['rgba(160,255,120,0.85)', 'rgba(80,220,80,0.25)', 'rgba(60,200,60,0)']} />
            <BlurMask blur={0.05} style="normal" />
          </Path>
        </Group>

        {/* saucer */}
        <Group transform={[{ translateX: saucer.x }, { translateY: saucer.y }, { rotate: rad }]}>
          <Group transform={[{ scaleY: 0.7 }]}>
            <Circle cx={0} cy={-sW * 0.12} r={sW * 0.32}>
              <RadialGradient c={vec(-sW * 0.1, -sW * 0.22)} r={sW * 0.4} colors={['#DFFFFB', '#46E0FF', '#0A6AA0']} />
            </Circle>
          </Group>
          <Group transform={[{ scaleY: 0.4 }]}>
            <Circle cx={0} cy={0} r={sW * 0.62}>
              <LinearGradient start={vec(-sW * 0.62, 0)} end={vec(sW * 0.62, 0)} colors={['#5A6B72', '#C7D6DC', '#8A9AA2', '#3A474D']} />
            </Circle>
          </Group>
          {[-0.42, -0.21, 0, 0.21, 0.42].map((t, i) => (
            <SaucerLight key={i} x={t * sW} y={sW * 0.12} r={sW * 0.05} color={lightColors[i]} base={i} clock={clock} />
          ))}
        </Group>
      </Group>
    </>
  );
}
