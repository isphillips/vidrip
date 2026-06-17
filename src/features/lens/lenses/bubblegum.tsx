import React from 'react';
import { Group, Circle, RadialGradient, BlurMask, vec } from '@shopify/react-native-skia';
import { off, type LensProps } from '../core';

// INTERACTION LENS — open your mouth to blow a bubblegum bubble. The bubble's size and opacity track
// f.mouthOpen, so it inflates as you open wide and deflates as you close.
export function Bubblegum({ f }: LensProps) {
  const g = f.mouthOpen;
  // Bubble sits just in front of the mouth, growing outward (down the chin axis) as it inflates.
  const r = f.faceW * (0.12 + g * 0.85);
  const c = off(f, f.mouth, -r * 0.7, 0); // push it off the mouth as it grows
  return (
    <Group opacity={Math.min(1, g * 1.4)}>
      <Circle cx={c.x} cy={c.y} r={r}>
        <RadialGradient c={vec(c.x - r * 0.3, c.y - r * 0.3)} r={r * 1.4}
          colors={['#FFD7EE', '#FF8AD0', '#F45AAE', '#D63C8E']} />
      </Circle>
      {/* glossy rim + highlight */}
      <Circle cx={c.x} cy={c.y} r={r} style="stroke" strokeWidth={Math.max(1, r * 0.04)} color="rgba(255,255,255,0.5)" />
      <Circle cx={c.x - r * 0.34} cy={c.y - r * 0.34} r={r * 0.18} color="rgba(255,255,255,0.85)">
        <BlurMask blur={2} style="solid" />
      </Circle>
    </Group>
  );
}
