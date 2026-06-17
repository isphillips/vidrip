import React from 'react';
import { Circle } from '@shopify/react-native-skia';
import type { LensProps } from '../core';

// Calibration overlay: colored dots on each anchor + a white dot on the reflection pivot (eye
// midpoint). Used to diagnose orientation/tilt — eyes should share ~y, nose centered & below, and
// the white dot centered between the eyes.
export function Debug({ f }: LensProps) {
  const r = Math.max(4, f.eyeDist * 0.18);
  const px = (f.le.x + f.re.x) / 2, py = (f.le.y + f.re.y) / 2; // pivot = eye midpoint
  return (
    <>
      <Circle cx={f.le.x} cy={f.le.y} r={r} color="#22ff22" />
      <Circle cx={f.re.x} cy={f.re.y} r={r} color="#ff2222" />
      <Circle cx={f.nose.x} cy={f.nose.y} r={r} color="#3388ff" />
      <Circle cx={f.mouth.x} cy={f.mouth.y} r={r} color="#ffdd22" />
      <Circle cx={px} cy={py} r={r * 0.7} color="#ffffff" />
    </>
  );
}
