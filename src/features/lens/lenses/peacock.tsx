import React from 'react';
import { Group, Circle, Path, Skia, LinearGradient, BlurMask, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, ScreenTint, WorldVignette, GlowOrb, type LensProps } from '../core';

// Unit plume: base at the origin, tapering to a tip at y=-1 (the feather points "up"/outward).
const PLUME: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(0, 0);
  p.cubicTo(0.12, -0.3, 0.1, -0.85, 0, -1);
  p.cubicTo(-0.1, -0.85, -0.12, -0.3, 0, 0);
  p.close();
  return p;
})();

// One peacock feather: a teal plume topped with a concentric eye-spot, rotated out from the pivot
// with a gentle shimmer sway.
function Feather({ px, py, baseAngle, fw, fl, eyeR, speed, base, clock }: {
  px: number; py: number; baseAngle: number; fw: number; fl: number; eyeR: number; speed: number; base: number; clock: SharedValue<number>;
}) {
  const tf = useDerivedValue(() => [
    { translateX: px }, { translateY: py },
    { rotate: baseAngle + Math.sin(clock.value * speed + base) * 0.04 },
  ]);
  return (
    <Group transform={tf}>
      <Group transform={[{ scaleX: fw }, { scaleY: fl }]}>
        <Path path={PLUME}>
          <LinearGradient start={vec(0, 0)} end={vec(0, -1)} colors={['#0A6E5A', '#13A07A', '#2BD4C0']} />
        </Path>
      </Group>
      {/* eye-spot at the tip (drawn unscaled so the rings stay round) */}
      <Group>
        <Circle cx={0} cy={-fl} r={eyeR} color="#1A6B3A" />
        <Circle cx={0} cy={-fl} r={eyeR * 0.74} color="#C8A02A" />
        <Circle cx={0} cy={-fl} r={eyeR * 0.5} color="#0E8C8C" />
        <Circle cx={0} cy={-fl} r={eyeR * 0.3} color="#2A2A8C" />
        <Circle cx={0 - eyeR * 0.08} cy={-fl - eyeR * 0.08} r={eyeR * 0.1} color="rgba(255,255,255,0.9)" />
      </Group>
    </Group>
  );
}

// A regal world with a full peacock tail fanning behind the head in shimmering iridescent feathers.
export function Peacock({ f, clock, w, h }: LensProps) {
  const rad = (f.rollDeg * Math.PI) / 180;
  const pivot = off(f, f.eyeMid, f.faceW * 0.15, 0);
  const N = 15;
  const span = 1.25;                 // half-fan in radians
  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(0,40,40,0.45)', 'rgba(0,70,60,0.15)', 'rgba(0,25,25,0.4)']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(43,212,192,0)', 'rgba(10,110,90,0.3)', 'rgba(0,18,18,0.72)']} />
      <GlowOrb x={f.nose.x} y={f.eyeMid.y} r={f.faceW * 1.4} colors={['rgba(43,212,192,0.18)', 'rgba(10,110,90,0)']} opacity={0.6} blur={36} />
      {/* back row: long feathers */}
      {Array.from({ length: N }).map((_, i) => {
        const a = rad + (i / (N - 1) - 0.5) * 2 * span;
        return <Feather key={`b${i}`} px={pivot.x} py={pivot.y} baseAngle={a} fw={f.faceW * 0.34} fl={f.faceW * 1.9} eyeR={f.faceW * 0.17} speed={1.2} base={i * 0.5} clock={clock} />;
      })}
      {/* front row: shorter, fills gaps */}
      {Array.from({ length: N - 1 }).map((_, i) => {
        const a = rad + ((i + 0.5) / (N - 1) - 0.5) * 2 * span;
        return <Feather key={`f${i}`} px={pivot.x} py={pivot.y} baseAngle={a} fw={f.faceW * 0.3} fl={f.faceW * 1.45} eyeR={f.faceW * 0.14} speed={1.5} base={i * 0.6 + 1} clock={clock} />;
      })}
    </>
  );
}
