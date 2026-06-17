import React from 'react';
import { Group, Circle, Path, Skia, RadialGradient, BlurMask, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, BAT, ScreenTint, WorldVignette, GlowOrb, type LensProps } from '../core';

// Unit fang: a downward-pointing triangle (apex at the bottom), tip at y=0.5.
const FANG: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(-0.5, -0.5); p.lineTo(0.5, -0.5); p.lineTo(0, 0.5); p.close();
  return p;
})();

// A bat flapping across the night, drifting on a slow arc with a wing-flap squash.
function FlyingBat({ x0, y0, driftX, driftY, size, dur, base, clock }: {
  x0: number; y0: number; driftX: number; driftY: number; size: number; dur: number; base: number; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const tf = useDerivedValue(() => {
    const t = v.value;
    const flap = 0.6 + 0.4 * Math.abs(Math.sin(clock.value * 9 + base));
    return [
      { translateX: x0 + t * driftX },
      { translateY: y0 + t * driftY + Math.sin(t * Math.PI * 4) * size * 0.4 },
      { scaleX: size * flap }, { scaleY: size },
    ];
  });
  const op = useDerivedValue(() => { const t = v.value; return t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9; });
  return <Group transform={tf} opacity={op}><Path path={BAT} color="#120814" /></Group>;
}

// A vampiric night: blood-red gloom, a blood moon, glowing red eyes, fangs over the mouth, and bats
// streaming across the sky.
export function Vampire({ f, clock, w, h }: LensProps) {
  const rad = (f.rollDeg * Math.PI) / 180;
  const fangS = f.eyeDist * 0.34;
  const fangL = off(f, f.mouth, f.eyeDist * 0.05, f.eyeDist * 0.26);
  const fangR = off(f, f.mouth, f.eyeDist * 0.05, -f.eyeDist * 0.26);
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#1A0008', '#2E0010', '#0A0004']} opacity={0.52} />
      <WorldVignette w={w} h={h} colors={['rgba(140,0,30,0)', 'rgba(80,0,20,0.45)', 'rgba(8,0,4,0.9)']} />
      {/* blood moon */}
      <Circle cx={w * 0.78} cy={h * 0.18} r={w * 0.16}>
        <RadialGradient c={vec(w * 0.78, h * 0.18)} r={w * 0.16} colors={['#FFD0C0', '#E03A30', '#7A0010']} />
      </Circle>
      <GlowOrb x={w * 0.78} y={h * 0.18} r={w * 0.4} colors={['rgba(255,60,40,0.3)', 'rgba(180,0,20,0)']} opacity={0.7} blur={40} />
      {/* bats across the sky */}
      {Array.from({ length: 7 }).map((_, i) => (
        <FlyingBat key={i} x0={-w * 0.15} y0={h * (0.15 + rnd(i) * 0.6)}
          driftX={w * (1.2 + rnd(i, 2) * 0.4)} driftY={(rnd(i, 3) - 0.5) * h * 0.3}
          size={w * (0.08 + rnd(i, 4) * 0.08)} dur={3 + rnd(i, 5) * 3} base={rnd(i, 6)} clock={clock} />
      ))}
      {/* glowing red eyes */}
      {[f.le, f.re].map((e, i) => (
        <Circle key={i} cx={e.x} cy={e.y} r={f.eyeDist * 0.26}>
          <RadialGradient c={vec(e.x, e.y)} r={f.eyeDist * 0.26} colors={['#FFD0C0', '#FF2A10', 'rgba(255,30,0,0)']} />
          <BlurMask blur={3} style="solid" />
        </Circle>
      ))}
      {/* fangs over the mouth */}
      {[fangL, fangR].map((fp, i) => (
        <Group key={i} transform={[{ translateX: fp.x }, { translateY: fp.y }, { rotate: rad }, { scale: fangS }]}>
          <Path path={FANG} color="#FFFFFF" />
          <Path path={FANG} style="stroke" strokeWidth={0.04} color="rgba(150,150,160,0.6)" />
        </Group>
      ))}
    </>
  );
}
