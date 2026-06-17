import React from 'react';
import { Group, Path, Line, Skia, LinearGradient, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, Sparkle, ScreenTint, WorldVignette, type LensProps } from '../core';

// Unit ear triangle (apex up).
const EAR: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(-0.5, 0.5); p.lineTo(0, -0.5); p.lineTo(0.5, 0.5); p.close();
  return p;
})();
// Inner ear (smaller, sits low inside the ear).
const EAR_IN: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(-0.3, 0.4); p.lineTo(0, -0.28); p.lineTo(0.3, 0.4); p.close();
  return p;
})();
// Cat nose (rounded downward triangle).
const NOSE: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(-0.5, -0.4); p.lineTo(0.5, -0.4);
  p.cubicTo(0.4, 0.2, 0.12, 0.5, 0, 0.5);
  p.cubicTo(-0.12, 0.5, -0.4, 0.2, -0.5, -0.4);
  p.close();
  return p;
})();

// A twitching ear that tilts with the head and flicks now and then.
function Ear({ x, y, size, angle, base, clock }: {
  x: number; y: number; size: number; angle: number; base: number; clock: SharedValue<number>;
}) {
  const tf = useDerivedValue(() => [
    { translateX: x }, { translateY: y },
    { rotate: angle + Math.sin(clock.value * 1.3 + base) * 0.06 },
    { scale: size },
  ]);
  return (
    <Group transform={tf}>
      <Path path={EAR}><LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={['#3A333E', '#1C181F']} /></Path>
      <Path path={EAR_IN} color="#FF9ECb" />
    </Group>
  );
}

// Playful kitty: soft pink world, twitchy cat ears, a pink nose, and whiskers.
export function Cat({ f, clock, w, h }: LensProps) {
  const rad = (f.rollDeg * Math.PI) / 180;
  const earL = off(f, f.le, f.faceW * 0.72, f.faceW * 0.05);
  const earR = off(f, f.re, f.faceW * 0.72, -f.faceW * 0.05);
  const earSz = f.faceW * 0.6;
  const noseSz = f.eyeDist * 0.3;
  // whisker roots just beside the nose, three per side fanning out (tilt-aware via off()).
  const rootL = off(f, f.nose, -f.eyeDist * 0.05, f.eyeDist * 0.45);
  const rootR = off(f, f.nose, -f.eyeDist * 0.05, -f.eyeDist * 0.45);
  const spread = [0.18, 0, -0.18];
  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(255,225,240,0.32)', 'rgba(255,210,235,0.08)', 'rgba(255,200,230,0.28)']} opacity={0.42} />
      <WorldVignette w={w} h={h} colors={['rgba(255,200,235,0)', 'rgba(255,170,215,0.18)', 'rgba(230,140,185,0.4)']} />

      {/* ears */}
      <Ear x={earL.x} y={earL.y} size={earSz} angle={rad - 0.18} base={0} clock={clock} />
      <Ear x={earR.x} y={earR.y} size={earSz} angle={rad + 0.18} base={1.5} clock={clock} />

      {/* nose */}
      <Group transform={[{ translateX: f.nose.x }, { translateY: f.nose.y }, { rotate: rad }, { scale: noseSz }]}>
        <Path path={NOSE}><LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={['#FF8FC0', '#E85AA0']} /></Path>
      </Group>

      {/* whiskers */}
      {spread.map((s, i) => {
        const tL = off(f, rootL, f.faceW * s, f.faceW * 0.7);
        const tR = off(f, rootR, f.faceW * s, -f.faceW * 0.7);
        return (
          <Group key={i}>
            <Line p1={vec(rootL.x, rootL.y)} p2={vec(tL.x, tL.y)} style="stroke" strokeWidth={2} color="rgba(255,255,255,0.85)" strokeCap="round" />
            <Line p1={vec(rootR.x, rootR.y)} p2={vec(tR.x, tR.y)} style="stroke" strokeWidth={2} color="rgba(255,255,255,0.85)" strokeCap="round" />
          </Group>
        );
      })}

      {/* a couple of cute twinkles */}
      {Array.from({ length: 5 }).map((_, i) => {
        const p = off(f, f.eyeMid, f.faceW * (0.6 + rnd(i) * 0.5), (rnd(i, 2) - 0.5) * f.faceW * 1.8);
        return <Sparkle key={i} x={p.x} y={p.y} size={f.faceW * 0.05} base={i} speed={3 + rnd(i, 3) * 2} color="#FFD6EC" clock={clock} />;
      })}
    </>
  );
}
