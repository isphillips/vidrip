import React from 'react';
import { Group, Circle, Path, LinearGradient, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { rnd, HEART, Sparkle, ScreenTint, WorldVignette, GlowOrb, Motes, type LensProps } from '../core';

// A gradient heart that can pulse — used as the heart-eyes.
function GradientHeart({ x, y, size, roll, base, pulse, colors, clock }: {
  x: number; y: number; size: number; roll: number; base: number; pulse: boolean; colors: string[]; clock: SharedValue<number>;
}) {
  const tf = useDerivedValue(() => {
    const s = pulse ? size * (1 + 0.14 * Math.sin(clock.value * 4 + base)) : size;
    return [{ translateX: x }, { translateY: y }, { rotate: roll }, { scale: s }];
  });
  return (
    <Group transform={tf}>
      <Path path={HEART}>
        <LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={colors} />
        <BlurMask blur={0.03} style="solid" />
      </Path>
      {/* glossy candy highlights on the upper lobes */}
      <Circle cx={-0.2} cy={-0.16} r={0.13} color="rgba(255,255,255,0.55)"><BlurMask blur={0.04} style="normal" /></Circle>
      <Circle cx={0.16} cy={-0.04} r={0.06} color="rgba(255,255,255,0.4)"><BlurMask blur={0.03} style="normal" /></Circle>
    </Group>
  );
}

// A heart orbiting an elliptical path around the face.
function OrbitHeart({ cx0, cy0, rx, ry, base, speed, size, colors, clock }: {
  cx0: number; cy0: number; rx: number; ry: number; base: number; speed: number; size: number; colors: string[]; clock: SharedValue<number>;
}) {
  const tf = useDerivedValue(() => {
    const a = clock.value * speed + base;
    return [{ translateX: cx0 + Math.cos(a) * rx }, { translateY: cy0 + Math.sin(a) * ry }, { scale: size }];
  });
  return <Group transform={tf}><Path path={HEART}><LinearGradient start={vec(0, -0.5)} end={vec(0, 0.5)} colors={colors} /></Path></Group>;
}

// A romantic world: soft rose haze, dreamy pink bokeh drifting up, pulsing heart-eyes, orbiting
// hearts, and sparkles.
export function LoveStorm({ f, clock, w, h }: LensProps) {
  const rad = (f.rollDeg * Math.PI) / 180;
  const colors = ['#FFD1F0', '#FF6AD5', '#C774E8'];
  const eyeSz = f.eyeDist * 0.98;
  const c = { x: f.nose.x, y: f.eyeMid.y };
  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(255,210,235,0.4)', 'rgba(255,180,220,0.12)', 'rgba(255,150,205,0.35)']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(255,200,235,0)', 'rgba(255,150,205,0.25)', 'rgba(220,90,170,0.5)']} />
      <GlowOrb x={w * 0.5} y={h * 0.5} r={w * 0.7} colors={['rgba(255,160,215,0.25)', 'rgba(255,120,190,0)']} opacity={0.7} blur={44} />
      <Motes w={w} h={h} count={22} color="rgba(255,190,225,0.85)" clock={clock} dir={-1} sizeMin={2} sizeMax={7} seed={11} />
      <Circle cx={c.x} cy={c.y} r={f.faceW * 1.1} opacity={0.25}>
        <RadialGradient c={vec(c.x, c.y)} r={f.faceW * 1.1} colors={['#FF8AD8', 'rgba(255,80,180,0)']} />
        <BlurMask blur={20} style="normal" />
      </Circle>
      <GradientHeart x={f.le.x} y={f.le.y} size={eyeSz} roll={rad} base={0} pulse colors={colors} clock={clock} />
      <GradientHeart x={f.re.x} y={f.re.y} size={eyeSz} roll={rad} base={1} pulse colors={colors} clock={clock} />
      {Array.from({ length: 8 }).map((_, i) => (
        <OrbitHeart key={i} cx0={c.x} cy0={c.y} rx={f.faceW * (0.8 + (i % 2) * 0.25)} ry={f.faceW * (0.55 + (i % 2) * 0.18)}
          base={(i / 8) * Math.PI * 2} speed={0.7 + (i % 3) * 0.15} size={f.faceW * (0.1 + rnd(i) * 0.05)} colors={colors} clock={clock} />
      ))}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        return <Sparkle key={`s${i}`} x={c.x + Math.cos(a) * f.faceW} y={c.y + Math.sin(a) * f.faceW} size={f.faceW * 0.06} base={i} speed={2.5} color="#FFE0F5" clock={clock} />;
      })}
    </>
  );
}
