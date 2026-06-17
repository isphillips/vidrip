import React from 'react';
import { Group, Circle, RoundedRect, LinearGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { off, rnd, ScreenTint, WorldVignette, GlowOrb, type LensProps } from '../core';

const NEON = ['#FF4FD8', '#7A5CFF', '#00E5FF', '#00FF94', '#FFE600'];

// An eighth-note (note head + stem) floating upward with a sway and a tumble, fading near the top.
function Note({ x0, y0, sway, rise, size, dur, base, color, clock }: {
  x0: number; y0: number; sway: number; rise: number; size: number; dur: number; base: number; color: string; clock: SharedValue<number>;
}) {
  const v = useDerivedValue(() => (((clock.value / dur + base) % 1) + 1) % 1);
  const tf = useDerivedValue(() => {
    const t = v.value;
    return [
      { translateX: x0 + Math.sin((t + base) * Math.PI * 2) * sway },
      { translateY: y0 - t * rise },
      { rotate: Math.sin(clock.value * 2 + base) * 0.3 },
      { scale: size },
    ];
  });
  const op = useDerivedValue(() => { const t = v.value; return t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9; });
  return (
    <Group transform={tf} opacity={op}>
      <Circle cx={-0.18} cy={0.32} r={0.2} color={color} />
      <RoundedRect x={0.0} y={-0.5} width={0.07} height={0.85} r={0.03} color={color} />
      <RoundedRect x={0.0} y={-0.5} width={0.26} height={0.16} r={0.06} color={color} />
    </Group>
  );
}

// A vibey music world: dark neon club grade, a glow, an equalizer dancing along the bottom, and
// music notes floating up around the head.
export function MusicVibe({ f, clock, w, h }: LensProps) {
  const bars = 13;
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#10021E', '#1E0540', '#06010E']} opacity={0.5} />
      <WorldVignette w={w} h={h} colors={['rgba(122,92,255,0)', 'rgba(80,30,160,0.32)', 'rgba(6,1,14,0.85)']} />
      <GlowOrb x={w * 0.5} y={h * 0.5} r={w * 0.75} colors={['rgba(255,79,216,0.18)', 'rgba(0,229,255,0)']} opacity={0.6} blur={44} />
      {/* equalizer along the bottom */}
      <EqualizerBars w={w} h={h} bars={bars} clock={clock} />
      {/* floating notes */}
      {Array.from({ length: 14 }).map((_, i) => {
        const start = off(f, f.eyeMid, f.faceW * (0.2 + rnd(i) * 0.5), (rnd(i, 2) - 0.5) * f.faceW * 2.2);
        return <Note key={i} x0={start.x} y0={start.y} sway={f.faceW * 0.18} rise={f.faceW * (1.4 + rnd(i, 3) * 1)}
          size={f.faceW * (0.18 + rnd(i, 4) * 0.12)} dur={2.4 + rnd(i, 5) * 2} base={rnd(i, 6)} color={NEON[i % NEON.length]} clock={clock} />;
      })}
    </>
  );
}

// A row of neon equalizer bars whose heights bounce to the clock.
function EqualizerBars({ w, h, bars, clock }: { w: number; h: number; bars: number; clock: SharedValue<number> }) {
  const gap = w * 0.012;
  const bw = (w - gap * (bars + 1)) / bars;
  const maxH = h * 0.22;
  return (
    <>
      {Array.from({ length: bars }).map((_, i) => (
        <EqBar key={i} x={gap + i * (bw + gap)} bw={bw} baseY={h} maxH={maxH} idx={i} color={NEON[i % NEON.length]} clock={clock} />
      ))}
    </>
  );
}

function EqBar({ x, bw, baseY, maxH, idx, color, clock }: {
  x: number; bw: number; baseY: number; maxH: number; idx: number; color: string; clock: SharedValue<number>;
}) {
  const bh = useDerivedValue(() => {
    const v = 0.25 + 0.75 * Math.abs(Math.sin(clock.value * (3 + (idx % 4)) + idx * 0.9));
    return maxH * v;
  });
  const y = useDerivedValue(() => baseY - bh.value);
  return (
    <RoundedRect x={x} y={y} width={bw} height={bh} r={bw * 0.4} opacity={0.85}>
      <LinearGradient start={vec(x, baseY - maxH)} end={vec(x, baseY)} colors={[color, 'rgba(255,255,255,0.2)']} />
      <BlurMask blur={2} style="solid" />
    </RoundedRect>
  );
}
