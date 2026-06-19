import React from 'react';
import { Group, Circle, Path, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { rnd, GHOST, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A translucent ghost that floats up on a wavy path, gently squashing as if breathing, and fades.
function Spectre({ x0, y0, sway, rise, size, dur, base, clock }: {
  x0: number; y0: number; sway: number; rise: number; size: number; dur: number; base: number; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const tf = useDerivedValue(() => {
    const t = v.value;
    const wob = 1 + 0.06 * Math.sin(clock.value * 3 + base);
    return [
      { translateX: x0 + Math.sin((t + base) * Math.PI * 2) * sway },
      { translateY: y0 - t * rise },
      { scaleX: size / wob }, { scaleY: size * wob },
    ];
  });
  const op = useDerivedValue(() => { const t = v.value; return (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) * 0.62; });
  return (
    <Group transform={tf} opacity={op}>
      {/* a soft outer aura so the apparition glows rather than reads as a hard sticker */}
      <Path path={GHOST} color="rgba(200,225,255,0.5)"><BlurMask blur={0.12} style="normal" /></Path>
      {/* wispy translucent body with soft edges */}
      <Path path={GHOST} color="rgba(225,240,255,0.82)"><BlurMask blur={0.035} style="solid" /></Path>
      {/* hollow eyes + mouth, softened */}
      <Circle cx={-0.13} cy={-0.12} r={0.065} color="rgba(30,46,62,0.85)"><BlurMask blur={0.015} style="normal" /></Circle>
      <Circle cx={0.13} cy={-0.12} r={0.065} color="rgba(30,46,62,0.85)"><BlurMask blur={0.015} style="normal" /></Circle>
      <Circle cx={0} cy={0.06} r={0.055} color="rgba(30,46,62,0.8)"><BlurMask blur={0.015} style="normal" /></Circle>
    </Group>
  );
}

// A haunted world: cold blue-grey gloom, low graveyard fog, drifting spectres, and the wearer's own
// eyes turned into hollow, glowing voids.
export function Ghost({ f, clock, w, h }: LensProps) {
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#0A1018', '#16222E', '#04080C']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(150,190,220,0)', 'rgba(60,90,120,0.32)', 'rgba(3,8,12,0.85)']} />
      {/* low fog rising from the bottom */}
      <GlowOrb x={w * 0.5} y={h * 1.02} r={w} colors={['rgba(180,210,235,0.35)', 'rgba(120,160,200,0)']} opacity={0.7} blur={50} />
      <Motes w={w} h={h} count={18} color="rgba(200,225,250,0.6)" clock={clock} dir={-1} sizeMin={3} sizeMax={9} seed={51} />

      {/* spectral hollow eyes on the wearer */}
      {[f.le, f.re].map((e, i) => (
        <Group key={i}>
          <Circle cx={e.x} cy={e.y} r={f.eyeDist * 0.3} opacity={0.6}>
            <RadialGradient c={vec(e.x, e.y)} r={f.eyeDist * 0.3} colors={['#BFE6FF', '#3A6E9E', 'rgba(20,40,70,0)']} />
            <BlurMask blur={4} style="solid" />
          </Circle>
          <Circle cx={e.x} cy={e.y} r={f.eyeDist * 0.16} color="#0A1622" />
        </Group>
      ))}

      {/* drifting ghosts */}
      {Array.from({ length: 5 }).map((_, i) => (
        <Spectre key={i} x0={rnd(i) * w} y0={h * (0.7 + rnd(i, 2) * 0.4)}
          sway={w * (0.04 + rnd(i, 3) * 0.05)} rise={h * (0.9 + rnd(i, 4) * 0.5)}
          size={f.faceW * (0.6 + rnd(i, 5) * 0.6)} dur={5 + rnd(i, 6) * 4} base={rnd(i, 7)} clock={clock} />
      ))}
    </>
  );
}
