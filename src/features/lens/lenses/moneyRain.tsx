import React from 'react';
import { Group, Circle, RoundedRect, LinearGradient, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { rnd, Sparkle, ScreenTint, WorldVignette, GlowOrb, type LensProps } from '../core';

// A falling banknote that tumbles end-over-end as it drops, fading near the bottom.
function Bill({ x0, w, h, dur, base, clock }: {
  x0: number; w: number; h: number; dur: number; base: number; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const tf = useDerivedValue(() => {
    const t = v.value;
    return [
      { translateX: x0 + Math.sin((t + base) * Math.PI * 3) * w * 0.04 },
      { translateY: -h * 0.1 + t * h * 1.2 },
      { rotate: Math.sin(t * 6 + base) * 0.5 },          // gentle spin
      { scaleY: Math.cos(t * 14 + base * 6) },           // end-over-end tumble (flips through edge-on)
    ];
  });
  const op = useDerivedValue(() => (v.value > 0.85 ? (1 - v.value) / 0.15 : 1));
  const bw = w * 0.13, bh = bw * 0.42;
  return (
    <Group transform={tf} opacity={op}>
      <RoundedRect x={-bw / 2} y={-bh / 2} width={bw} height={bh} r={bh * 0.12}>
        <LinearGradient start={vec(0, -bh / 2)} end={vec(0, bh / 2)} colors={['#7BE5A8', '#3FB573', '#207A4B']} />
      </RoundedRect>
      <RoundedRect x={-bw / 2 + bw * 0.06} y={-bh / 2 + bh * 0.12} width={bw - bw * 0.12} height={bh - bh * 0.24} r={bh * 0.1} style="stroke" strokeWidth={Math.max(1, bw * 0.02)} color="rgba(255,255,255,0.5)" />
      <Circle cx={0} cy={0} r={bh * 0.26} color="rgba(255,255,255,0.5)" />
    </Group>
  );
}

// A spinning gold coin (its width squashes to fake the rotation), dropping.
function Coin({ x0, w, h, dur, base, clock }: {
  x0: number; w: number; h: number; dur: number; base: number; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const tf = useDerivedValue(() => {
    const t = v.value;
    return [
      { translateX: x0 + Math.sin((t + base) * Math.PI * 2) * w * 0.03 },
      { translateY: -h * 0.1 + t * h * 1.2 },
      { scaleX: Math.abs(Math.cos(clock.value * 4 + base)) * 0.85 + 0.15 }, // spin
    ];
  });
  const op = useDerivedValue(() => (v.value > 0.85 ? (1 - v.value) / 0.15 : 1));
  const r = w * 0.04;
  return (
    <Group transform={tf} opacity={op}>
      <Circle cx={0} cy={0} r={r}><RadialGradient c={vec(-r * 0.3, -r * 0.3)} r={r * 1.4} colors={['#FFF6C0', '#FFD23C', '#B8860B']} /></Circle>
      <Circle cx={0} cy={0} r={r} style="stroke" strokeWidth={r * 0.14} color="#9A6B0A" />
    </Group>
  );
}

// A world of wealth: rich green-gold grade, a money glow, and a downpour of cash + gold coins.
export function MoneyRain({ clock, w, h }: LensProps) {
  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(20,60,30,0.45)', 'rgba(30,90,45,0.12)', 'rgba(10,35,18,0.4)']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(60,200,110,0)', 'rgba(20,110,55,0.3)', 'rgba(5,30,15,0.7)']} />
      <GlowOrb x={w * 0.5} y={h * 0.4} r={w * 0.7} colors={['rgba(120,255,170,0.2)', 'rgba(40,160,80,0)']} opacity={0.6} blur={42} />
      {Array.from({ length: 14 }).map((_, i) => (
        <Bill key={`b${i}`} x0={rnd(i) * w} w={w} h={h} dur={2.4 + rnd(i, 2) * 2} base={rnd(i, 3)} clock={clock} />
      ))}
      {Array.from({ length: 12 }).map((_, i) => (
        <Coin key={`c${i}`} x0={rnd(i, 5) * w} w={w} h={h} dur={2 + rnd(i, 6) * 1.8} base={rnd(i, 7)} clock={clock} />
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <Sparkle key={`s${i}`} x={rnd(i, 8) * w} y={rnd(i, 9) * h} size={w * 0.02} base={i} speed={3 + rnd(i, 10) * 3} color="#FFF0A0" clock={clock} />
      ))}
    </>
  );
}
