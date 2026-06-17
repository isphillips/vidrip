import React from 'react';
import { Group, Circle, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { off, rnd, Drifter, type LensProps } from '../core';

const RAINBOW = ['#FF004D', '#FF8A00', '#FFE600', '#00E676', '#00B0FF', '#7C4DFF', '#FF5AF0'];

// INTERACTION LENS — open your mouth to pour out a rainbow. A stream of multi-colour orbs gushes from
// the mouth, with opacity and reach scaling to f.mouthOpen.
export function RainbowBreath({ f, clock }: LensProps) {
  const g = f.mouthOpen;
  return (
    <Group opacity={g}>
      {/* rainbow shimmer at the mouth */}
      <Circle cx={f.mouth.x} cy={f.mouth.y} r={f.faceW * 0.4} opacity={0.6}>
        <RadialGradient c={vec(f.mouth.x, f.mouth.y)} r={f.faceW * 0.4} colors={['#FFFFFF', '#FF8AD8', 'rgba(124,77,255,0)']} />
        <BlurMask blur={8} style="normal" />
      </Circle>
      {Array.from({ length: 28 }).map((_, i) => {
        const spread = (rnd(i) - 0.5) * f.faceW * 1.0;        // lateral fan
        const start = off(f, f.mouth, -f.faceW * 0.25, spread);
        return <Drifter key={i} x0={start.x} y0={start.y} sway={f.faceW * 0.16} travel={f.faceW * (1.1 + rnd(i, 2) * 0.9) * (0.6 + g * 0.7)}
          size={f.faceW * (0.04 + rnd(i, 3) * 0.05)} dur={1 + rnd(i, 4) * 1.1} base={rnd(i, 5)} color={RAINBOW[i % RAINBOW.length]} clock={clock} />;
      })}
    </Group>
  );
}
