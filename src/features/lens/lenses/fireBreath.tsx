import React from 'react';
import { Group, Circle, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { off, rnd, FlameStack, Drifter, type LensProps } from '../core';

// INTERACTION LENS — open your mouth to breathe fire. The whole effect's opacity (and the flame
// spread) scales with f.mouthOpen, so it erupts as the jaw drops and dies as it closes.
export function FireBreath({ f, clock }: LensProps) {
  const g = f.mouthOpen;
  const rad = (f.rollDeg * Math.PI) / 180;
  const down = rad + Math.PI;           // FLAME points up at rest → +π aims it down out of the mouth
  const N = 6;
  return (
    <Group opacity={g}>
      {/* hot glow at the mouth + a white-hot blast core that flares as the jaw opens */}
      <Circle cx={f.mouth.x} cy={f.mouth.y} r={f.faceW * 0.45} opacity={0.55}>
        <RadialGradient c={vec(f.mouth.x, f.mouth.y)} r={f.faceW * 0.45} colors={['#FFE08A', '#FF6B00', 'rgba(255,45,0,0)']} />
        <BlurMask blur={10} style="normal" />
      </Circle>
      <Circle cx={f.mouth.x} cy={f.mouth.y} r={f.faceW * (0.12 + g * 0.22)} opacity={0.85}>
        <RadialGradient c={vec(f.mouth.x, f.mouth.y)} r={f.faceW * (0.12 + g * 0.22)} colors={['#FFFFFF', '#FFD24A', 'rgba(255,120,0,0)']} />
        <BlurMask blur={6} style="normal" />
      </Circle>
      {Array.from({ length: N }).map((_, i) => {
        const t = i / (N - 1) - 0.5;                                  // -0.5..0.5 across the cone
        const dist = f.faceW * (0.45 + (0.5 - Math.abs(t)) * 0.7) * (0.6 + g * 0.7);
        const side = t * f.faceW * 0.9;
        const p = off(f, f.mouth, -dist, side);                       // negative up = down the chin/out
        const size = f.faceW * (0.5 - Math.abs(t) * 0.18);
        return <FlameStack key={i} x={p.x} y={p.y} size={size} roll={down + t * 0.5} base={i * 1.9} clock={clock} />;
      })}
      {/* embers spitting outward */}
      {Array.from({ length: 12 }).map((_, i) => {
        const start = off(f, f.mouth, -f.faceW * 0.3, (rnd(i) - 0.5) * f.faceW * 0.7);
        return <Drifter key={`e${i}`} x0={start.x} y0={start.y} sway={f.faceW * 0.14} travel={f.faceW * (1 + rnd(i, 2) * 0.8)}
          size={f.faceW * (0.015 + rnd(i, 3) * 0.025)} dur={0.8 + rnd(i, 4) * 0.9} base={rnd(i, 5)} color={i % 2 ? '#FFB000' : '#FF5A00'} clock={clock} />;
      })}
    </Group>
  );
}
