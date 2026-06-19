import React from 'react';
import { Group, Path, BlurMask } from '@shopify/react-native-skia';
import {
  meshPath, FACE_OVAL, RIGHT_EYE, LEFT_EYE, LIPS_OUTER, RIGHT_BROW, LEFT_BROW, NOSE_BRIDGE,
  type Pt, type FaceFrame,
} from '../core';

// Shared helpers for the face-mesh lenses. Keeps each lens file small and the wire/sampling logic
// consistent. All operate on FaceFrame.mesh (canonical-indexed, sparse on replay) + meshPts (dense).

// Accepts a plain colour string OR an animated reanimated value (the Skia color prop takes both).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SkColor = any;

export const FACE_LOOPS: { idx: number[]; close: boolean }[] = [
  { idx: FACE_OVAL, close: true },
  { idx: RIGHT_EYE, close: true },
  { idx: LEFT_EYE, close: true },
  { idx: LIPS_OUTER, close: true },
  { idx: RIGHT_BROW, close: false },
  { idx: LEFT_BROW, close: false },
  { idx: NOSE_BRIDGE, close: false },
];

/** Skia paths for every facial contour of the current mesh. */
export function facePaths(mesh: FaceFrame['mesh']) {
  return FACE_LOOPS.map(l => meshPath(mesh, l.idx, l.close));
}

/** Just the face-oval (jaw) path — handy for clipping a fill to the face. */
export function ovalPath(mesh: FaceFrame['mesh']) {
  return meshPath(mesh, FACE_OVAL, true);
}

/** Glowing wireframe of every contour: a blurred colour pass + an optional crisp core line. */
export function MeshWire({ mesh, color, width = 2.5, blur = 6, core, opacity = 1 }: {
  mesh: FaceFrame['mesh']; color: SkColor; width?: number; blur?: number; core?: string; opacity?: number;
}) {
  const paths = facePaths(mesh);
  return (
    <Group opacity={opacity}>
      {paths.map((p, i) => (
        <Path key={i} path={p} style="stroke" strokeWidth={width} strokeJoin="round" strokeCap="round" color={color}>
          <BlurMask blur={blur} style="solid" />
        </Path>
      ))}
      {core && paths.map((p, i) => (
        <Path key={`c${i}`} path={p} style="stroke" strokeWidth={Math.max(0.7, width * 0.35)} strokeJoin="round" strokeCap="round" color={core} />
      ))}
    </Group>
  );
}

/** Every `step`-th dense mesh point — a bounded set of anchors for particle effects. */
export function sample(meshPts: Pt[] | undefined, step: number): Pt[] {
  if (!meshPts || meshPts.length === 0) { return []; }
  const out: Pt[] = [];
  for (let i = 0; i < meshPts.length; i += step) { out.push(meshPts[i]); }
  return out;
}
