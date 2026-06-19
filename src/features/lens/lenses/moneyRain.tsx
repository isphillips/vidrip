import React from 'react';
import { Group } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { rnd, Banknote, GoldCoin, Sparkle, ScreenTint, WorldVignette, GlowOrb, type LensProps } from '../core';

// A real banknote tumbling end-over-end as it falls (flips through edge-on via scaleY), drifting and
// fading out near the floor.
function Bill({ x0, w, h, size, dur, base, clock }: {
  x0: number; w: number; h: number; size: number; dur: number; base: number; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const tf = useDerivedValue(() => {
    const t = v.value;
    return [
      { translateX: x0 + Math.sin((t + base) * Math.PI * 3) * w * 0.05 },
      { translateY: -h * 0.12 + t * h * 1.25 },
      { rotate: Math.sin(t * 5 + base) * 0.45 },          // sway/flutter
      { scale: size },
      { scaleY: Math.cos(t * 12 + base * 6) },            // end-over-end tumble through edge-on
    ];
  });
  const op = useDerivedValue(() => (v.value > 0.86 ? (1 - v.value) / 0.14 : 1));
  return <Group transform={tf} opacity={op}><Banknote /></Group>;
}

// A spinning gold coin — the GoldCoin face squashed on X to fake the rotation through edge-on.
function Coin({ x0, w, h, size, dur, base, clock }: {
  x0: number; w: number; h: number; size: number; dur: number; base: number; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const tf = useDerivedValue(() => {
    const t = v.value;
    return [
      { translateX: x0 + Math.sin((t + base) * Math.PI * 2) * w * 0.03 },
      { translateY: -h * 0.12 + t * h * 1.25 },
      { rotate: t * 3 + base },
      { scale: size },
      { scaleX: Math.abs(Math.cos(clock.value * 4.5 + base * 5)) * 0.88 + 0.12 }, // edge-on spin
    ];
  });
  const op = useDerivedValue(() => (v.value > 0.86 ? (1 - v.value) / 0.14 : 1));
  return <Group transform={tf} opacity={op}><GoldCoin /></Group>;
}

// A world of wealth: rich green-gold grade, a warm vault light from above, and a downpour of real
// banknotes and spinning gold coins glinting as they tumble.
export function MoneyRain({ clock, w, h }: LensProps) {
  const billSize = w * 0.2, coinSize = w * 0.09;
  return (
    <>
      <ScreenTint w={w} h={h} colors={['rgba(20,60,30,0.45)', 'rgba(30,90,45,0.12)', 'rgba(10,35,18,0.4)']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(60,200,110,0)', 'rgba(20,110,55,0.3)', 'rgba(5,30,15,0.7)']} />
      <GlowOrb x={w * 0.5} y={h * 0.32} r={w * 0.7} colors={['rgba(255,235,150,0.22)', 'rgba(40,160,80,0)']} opacity={0.65} blur={42} />
      {Array.from({ length: 12 }).map((_, i) => (
        <Bill key={`b${i}`} x0={rnd(i) * w} w={w} h={h} size={billSize * (0.78 + rnd(i, 2) * 0.5)}
          dur={2.6 + rnd(i, 3) * 2.2} base={rnd(i, 4)} clock={clock} />
      ))}
      {Array.from({ length: 11 }).map((_, i) => (
        <Coin key={`c${i}`} x0={rnd(i, 5) * w} w={w} h={h} size={coinSize * (0.7 + rnd(i, 6) * 0.7)}
          dur={2.1 + rnd(i, 7) * 1.8} base={rnd(i, 8)} clock={clock} />
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <Sparkle key={`s${i}`} x={rnd(i, 9) * w} y={rnd(i, 10) * h} size={w * 0.018} base={i} speed={3 + rnd(i, 11) * 3} color="#FFF0A0" clock={clock} />
      ))}
    </>
  );
}
