import React from 'react';
import { Circle, Points } from '@shopify/react-native-skia';
import type { LensProps } from '../core';

// Calibration overlay: colored dots on each anchor + a white dot on the reflection pivot (eye
// midpoint). Used to diagnose orientation/tilt — eyes should share ~y, nose centered & below, and
// the white dot centered between the eyes. When the Face Landmarker (mesh) track is active and the
// full 478-pt mesh is present (useFaceTracking(_, withMesh)), it's drawn as a cyan point cloud so we
// can confirm the whole mesh tracks — not just the 6 reduced anchors.
export function Debug({ f }: LensProps) {
  const r = Math.max(4, f.eyeDist * 0.18);
  const px = (f.le.x + f.re.x) / 2, py = (f.le.y + f.re.y) / 2; // pivot = eye midpoint
  return (
    <>
      {f.meshPts && (
        <Points points={f.meshPts} mode="points" color="#00e5ff" style="stroke" strokeWidth={6} strokeCap="round" />
      )}
      <Circle cx={f.le.x} cy={f.le.y} r={r} color="#22ff22" />
      <Circle cx={f.re.x} cy={f.re.y} r={r} color="#ff2222" />
      <Circle cx={f.nose.x} cy={f.nose.y} r={r} color="#3388ff" />
      <Circle cx={f.mouth.x} cy={f.mouth.y} r={r} color="#ffdd22" />
      <Circle cx={px} cy={py} r={r * 0.7} color="#ffffff" />
    </>
  );
}
