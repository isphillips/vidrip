import React from 'react';
import { Group, Circle, Path, Skia, LinearGradient, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, PETAL, ScreenTint, WorldVignette, GodRays, type LensProps } from '../core';

// A cherry-blossom petal that flutters down, tumbling (spin + sway) and fading near the end.
function Petal({ x0, y0, sway, travel, size, dur, base, color, clock }: {
  x0: number; y0: number; sway: number; travel: number; size: number; dur: number; base: number; color: string[]; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const tf = useDerivedValue(() => {
    const t = v.value;
    const x = x0 + Math.sin((t + base) * Math.PI * 4) * sway;
    const y = y0 + t * travel;
    const tumble = Math.sin(clock.value * 2 + base) * 0.9 + t * 8;
    const flutter = 0.6 + 0.4 * Math.abs(Math.cos(clock.value * 3 + base)); // edge-on shimmer
    return [{ translateX: x }, { translateY: y }, { rotate: tumble }, { scaleX: size * flutter }, { scaleY: size }];
  });
  const op = useDerivedValue(() => { const t = v.value; return t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9; });
  return (
    <Group transform={tf} opacity={op}>
      <Path path={PETAL}>
        <LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={color} />
        <BlurMask blur={0.02} style="solid" />
      </Path>
      {/* centre vein + a darker base, so it reads as a real petal rather than a flat blob */}
      <Path path={(() => { const p = Skia.Path.Make(); p.moveTo(0, -0.42); p.lineTo(0, 0.4); return p; })()} style="stroke" strokeWidth={0.03} color="rgba(220,120,170,0.45)" />
    </Group>
  );
}

// A full five-petal cherry blossom that tumbles down — petals fanned around a golden centre.
function Blossom({ x0, y0, sway, travel, size, dur, base, color, clock }: {
  x0: number; y0: number; sway: number; travel: number; size: number; dur: number; base: number; color: string[]; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const tf = useDerivedValue(() => {
    const t = v.value;
    const x = x0 + Math.sin((t + base) * Math.PI * 3) * sway;
    const y = y0 + t * travel;
    const tumble = Math.sin(clock.value * 1.6 + base) * 0.5 + t * 5;
    const tip = 0.55 + 0.45 * Math.abs(Math.cos(clock.value * 2.2 + base)); // tips toward edge-on
    return [{ translateX: x }, { translateY: y }, { rotate: tumble }, { scaleX: size }, { scaleY: size * tip }];
  });
  const op = useDerivedValue(() => { const t = v.value; return t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9; });
  return (
    <Group transform={tf} opacity={op}>
      {[0, 1, 2, 3, 4].map((k) => (
        <Group key={k} transform={[{ rotate: (k * Math.PI * 2) / 5 }]}>
          <Group transform={[{ translateY: 0.34 }, { scale: 0.5 }]}>
            <Path path={PETAL}><LinearGradient start={vec(0, 0.5)} end={vec(0, -0.5)} colors={color} /></Path>
          </Group>
        </Group>
      ))}
      <Circle cx={0} cy={0} r={0.12}><RadialGradient c={vec(0, 0)} r={0.12} colors={['#FFF0B0', '#FFC93C', '#E89A1E']} /></Circle>
    </Group>
  );
}

// A spring grove: soft warm sunlight grade, dappled light through the canopy, and a gentle shower of
// pink blossom petals drifting down all around.
export function Petals({ f, clock, w, h }: LensProps) {
  const c = { x: f.nose.x, y: f.eyeMid.y };
  const pinks = [['#FFE3F1', '#FFB8DD'], ['#FFD0E8', '#FF9ECb'], ['#FFF0F6', '#FFC2DE']];
  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(255,240,225,0.4)', 'rgba(255,225,235,0.1)', 'rgba(255,215,230,0.32)']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(255,235,225,0)', 'rgba(255,200,220,0.22)', 'rgba(235,160,190,0.45)']} />
      <GodRays w={w} h={h} x={w * 0.7} y={-h * 0.1} color="rgba(255,238,210,0.5)" count={5} spread={1.0} clock={clock} opacity={0.4} />
      <Circle cx={c.x} cy={c.y} r={f.faceW * 1.25} opacity={0.22}>
        <RadialGradient c={vec(c.x, c.y)} r={f.faceW * 1.25} colors={['#FFD9EC', 'rgba(255,180,220,0)']} />
        <BlurMask blur={24} style="normal" />
      </Circle>
      {Array.from({ length: 18 }).map((_, i) => {
        const start = off(f, f.eyeMid, f.faceW * (0.6 + rnd(i) * 0.3), (rnd(i, 2) - 0.5) * f.faceW * 2.4);
        return <Petal key={i} x0={start.x} y0={start.y} sway={f.faceW * (0.12 + rnd(i, 3) * 0.14)}
          travel={f.faceW * (1.5 + rnd(i, 4) * 0.9)} size={f.faceW * (0.1 + rnd(i, 5) * 0.08)}
          dur={2.8 + rnd(i, 6) * 2.4} base={rnd(i, 7)} color={pinks[i % pinks.length]} clock={clock} />;
      })}
      {/* a few whole blossoms tumbling among the loose petals */}
      {Array.from({ length: 6 }).map((_, i) => {
        const start = off(f, f.eyeMid, f.faceW * (0.7 + rnd(i, 8) * 0.3), (rnd(i, 9) - 0.5) * f.faceW * 2.2);
        return <Blossom key={`bl${i}`} x0={start.x} y0={start.y} sway={f.faceW * (0.1 + rnd(i, 10) * 0.12)}
          travel={f.faceW * (1.4 + rnd(i, 11) * 0.8)} size={f.faceW * (0.16 + rnd(i, 12) * 0.1)}
          dur={3.2 + rnd(i, 13) * 2.4} base={rnd(i, 14)} color={pinks[i % pinks.length]} clock={clock} />;
      })}
    </>
  );
}
