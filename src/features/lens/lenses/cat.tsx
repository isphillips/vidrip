import React from 'react';
import { Group, Path, Skia, LinearGradient, RadialGradient, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, Sparkle, ScreenTint, WorldVignette, type LensProps } from '../core';

// Unit ear: a soft, rounded furry triangle (apex up, curved sides, rounded base).
const EAR: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(-0.5, 0.5);
  p.quadTo(-0.34, -0.32, 0, -0.5);   // left edge curving to a rounded tip
  p.quadTo(0.34, -0.32, 0.5, 0.5);   // right edge
  p.quadTo(0, 0.34, -0.5, 0.5);      // rounded base
  p.close();
  return p;
})();
// Inner ear (smaller, sits low inside the ear).
const EAR_IN: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(-0.28, 0.42);
  p.quadTo(-0.18, -0.16, 0, -0.3);
  p.quadTo(0.18, -0.16, 0.28, 0.42);
  p.quadTo(0, 0.3, -0.28, 0.42);
  p.close();
  return p;
})();
// Fur tufts poking out of the inner ear.
const TUFTS: SkPath = (() => {
  const p = Skia.Path.Make();
  for (const dx of [-0.16, 0, 0.16]) {
    p.moveTo(dx - 0.05, 0.4); p.lineTo(dx, -0.1); p.lineTo(dx + 0.05, 0.4);
  }
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

// A twitching ear that tilts with the head and flicks now and then. Shaded (top-lit grey fur), with a
// soft pink inner ear and pale fur tufts.
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
      <Path path={EAR}><LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={['#4A424F', '#2A2530', '#15121A']} /></Path>
      <Path path={EAR} style="stroke" strokeWidth={0.03} color="rgba(0,0,0,0.35)" />
      <Path path={EAR_IN}><RadialGradient c={vec(0, 0.1)} r={0.4} colors={['#FFC2DE', '#F07AB0', '#C84E88']} /></Path>
      <Path path={TUFTS} style="stroke" strokeWidth={0.025} strokeCap="round" color="rgba(245,235,240,0.8)" />
    </Group>
  );
}

// Playful kitty: soft pink world, twitchy shaded cat ears, a shaded pink nose, and curved whiskers.
export function Cat({ f, clock, w, h }: LensProps) {
  const rad = (f.rollDeg * Math.PI) / 180;
  const earL = off(f, f.le, f.faceW * 0.72, f.faceW * 0.05);
  const earR = off(f, f.re, f.faceW * 0.72, -f.faceW * 0.05);
  const earSz = f.faceW * 0.6;
  const noseSz = f.eyeDist * 0.3;
  // whisker roots just beside the nose, three per side fanning out (tilt-aware via off()).
  const rootL = off(f, f.nose, -f.eyeDist * 0.05, f.eyeDist * 0.45);
  const rootR = off(f, f.nose, -f.eyeDist * 0.05, -f.eyeDist * 0.45);
  const droop = [0.22, 0.04, -0.16]; // each whisker rises/droops differently
  // A whisker as a gently drooping curve from a root toward a tip (mirrored per side).
  const whisker = (root: typeof rootL, dir: 1 | -1, d: number) => {
    const tip = off(f, root, f.faceW * d, dir * f.faceW * 0.78);
    const ctrl = off(f, root, f.faceW * (d - 0.12), dir * f.faceW * 0.42); // sag below the chord
    const p = Skia.Path.Make();
    p.moveTo(root.x, root.y); p.quadTo(ctrl.x, ctrl.y, tip.x, tip.y);
    return p;
  };
  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(255,225,240,0.32)', 'rgba(255,210,235,0.08)', 'rgba(255,200,230,0.28)']} opacity={0.42} />
      <WorldVignette w={w} h={h} colors={['rgba(255,200,235,0)', 'rgba(255,170,215,0.18)', 'rgba(230,140,185,0.4)']} />

      {/* ears */}
      <Ear x={earL.x} y={earL.y} size={earSz} angle={rad - 0.18} base={0} clock={clock} />
      <Ear x={earR.x} y={earR.y} size={earSz} angle={rad + 0.18} base={1.5} clock={clock} />

      {/* nose — shaded with a highlight + nostril shadows */}
      <Group transform={[{ translateX: f.nose.x }, { translateY: f.nose.y }, { rotate: rad }, { scale: noseSz }]}>
        <Path path={NOSE}><LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={['#FFA8CF', '#F06AAA', '#C84684']} /></Path>
        <Path path={NOSE} style="stroke" strokeWidth={0.04} color="rgba(150,40,90,0.5)" />
        {/* glossy highlight on the bridge */}
        <Path path={(() => { const p = Skia.Path.Make(); p.moveTo(-0.18, -0.22); p.quadTo(0, -0.32, 0.18, -0.22); return p; })()} style="stroke" strokeWidth={0.08} strokeCap="round" color="rgba(255,255,255,0.6)" />
      </Group>

      {/* whiskers — drooping curves, thin and tapered-looking */}
      {droop.map((d, i) => (
        <Group key={i}>
          <Path path={whisker(rootL, 1, d)} style="stroke" strokeWidth={f.faceW * 0.012} strokeCap="round" color="rgba(255,255,255,0.85)" />
          <Path path={whisker(rootR, -1, d)} style="stroke" strokeWidth={f.faceW * 0.012} strokeCap="round" color="rgba(255,255,255,0.85)" />
        </Group>
      ))}

      {/* a couple of cute twinkles */}
      {Array.from({ length: 5 }).map((_, i) => {
        const p = off(f, f.eyeMid, f.faceW * (0.6 + rnd(i) * 0.5), (rnd(i, 2) - 0.5) * f.faceW * 1.8);
        return <Sparkle key={i} x={p.x} y={p.y} size={f.faceW * 0.05} base={i} speed={3 + rnd(i, 3) * 2} color="#FFD6EC" clock={clock} />;
      })}
    </>
  );
}
