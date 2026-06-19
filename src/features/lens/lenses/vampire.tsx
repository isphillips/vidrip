import React from 'react';
import { Group, Circle, Path, Skia, LinearGradient, RadialGradient, BlurMask, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, BAT, ScreenTint, WorldVignette, GlowOrb, type LensProps } from '../core';

// Unit canine fang: curved sides tapering to a sharp point at the bottom (y=0.5), root at the top.
const FANG: SkPath = (() => {
  const p = Skia.Path.Make();
  p.moveTo(-0.5, -0.5);
  p.cubicTo(-0.44, 0.05, -0.22, 0.34, 0, 0.5);   // left edge curving in to the tip
  p.cubicTo(0.22, 0.34, 0.44, 0.05, 0.5, -0.5);  // right edge back up to the root
  p.close();
  return p;
})();

// A bead of blood that wells at a fang tip and drips, on a loop.
function BloodDrip({ x, y, size, dur, base, clock }: {
  x: number; y: number; size: number; dur: number; base: number; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const cy = useDerivedValue(() => y + v.value * size * 9);
  const r = useDerivedValue(() => size * (0.5 + v.value * 0.7));
  const op = useDerivedValue(() => { const t = v.value; return t < 0.12 ? t / 0.12 : (t > 0.85 ? (1 - t) / 0.15 : 0.95); });
  return (
    <Group opacity={op}>
      <Circle cx={x} cy={cy} r={r}><RadialGradient c={vec(x - size * 0.2, y)} r={size} colors={['#FF5A5A', '#C40010', '#6A0008']} /></Circle>
      <Circle cx={x - size * 0.22} cy={cy} r={size * 0.18} color="rgba(255,200,200,0.7)" />
    </Group>
  );
}

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

// A vampiric night: blood-red gloom, a blood moon, slit-pupilled red eyes, glistening fangs that drip
// blood, and bats streaming across the sky.
export function Vampire({ f, clock, w, h }: LensProps) {
  const rad = (f.rollDeg * Math.PI) / 180;
  const fangS = f.eyeDist * 0.36;
  const fangL = off(f, f.mouth, f.eyeDist * 0.04, f.eyeDist * 0.24);
  const fangR = off(f, f.mouth, f.eyeDist * 0.04, -f.eyeDist * 0.24);
  // tip of each fang (unit 0,0.5 carried through rotate+scale) — where blood wells up
  const tip = (p: { x: number; y: number }) => ({ x: p.x + Math.sin(rad) * -0.5 * fangS, y: p.y + Math.cos(rad) * 0.5 * fangS });
  const tL = tip(fangL), tR = tip(fangR);
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
      {/* glowing red eyes with vertical slit pupils */}
      {[f.le, f.re].map((e, i) => (
        <Group key={i}>
          <Circle cx={e.x} cy={e.y} r={f.eyeDist * 0.26}>
            <RadialGradient c={vec(e.x, e.y)} r={f.eyeDist * 0.26} colors={['#FFD0C0', '#FF2A10', 'rgba(255,30,0,0)']} />
            <BlurMask blur={3} style="solid" />
          </Circle>
          <Group transform={[{ translateX: e.x }, { translateY: e.y }, { rotate: rad }, { scaleX: 0.26 }]}>
            <Circle cx={0} cy={0} r={f.eyeDist * 0.18} color="#1A0000" />
          </Group>
        </Group>
      ))}
      {/* fangs over the mouth — enamel gradient, gum at the root, wet highlight */}
      {[fangL, fangR].map((fp, i) => (
        <Group key={i} transform={[{ translateX: fp.x }, { translateY: fp.y }, { rotate: rad }, { scale: fangS }]}>
          {/* gum line at the root */}
          <Circle cx={0} cy={-0.42} r={0.26} color="#C23A52" />
          <Path path={FANG}><LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={['#FFFFFF', '#F4EEDC', '#D8CBB0']} /></Path>
          <Path path={FANG} style="stroke" strokeWidth={0.03} color="rgba(120,110,95,0.5)" />
          {/* wet vertical highlight */}
          <Path path={(() => { const p = Skia.Path.Make(); p.moveTo(-0.12, -0.32); p.cubicTo(-0.06, 0.0, -0.04, 0.2, 0, 0.36); return p; })()} style="stroke" strokeWidth={0.07} strokeCap="round" color="rgba(255,255,255,0.7)" />
        </Group>
      ))}
      {/* blood dripping from each fang tip */}
      <BloodDrip x={tL.x} y={tL.y} size={f.eyeDist * 0.08} dur={2.8} base={0.1} clock={clock} />
      <BloodDrip x={tR.x} y={tR.y} size={f.eyeDist * 0.08} dur={3.2} base={0.6} clock={clock} />
    </>
  );
}
