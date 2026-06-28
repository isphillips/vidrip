import React from 'react';
import { Group, Path, BlurMask, Skia, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  meshPath, FACE_OVAL, RIGHT_EYE, LEFT_EYE, LIPS_OUTER, RIGHT_BROW, LEFT_BROW, NOSE_BRIDGE,
  type Pt, type FaceFrame, type MeshFrame,
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

// ─── Reactive variants (UI-thread render) ──────────────────────────────────────
// Mirror the helpers above but read a SharedValue<MeshFrame> and build Skia objects inside
// useDerivedValue, so a mesh lens mounts ONCE and updates on the UI thread — no per-frame React
// reconcile (the snappy path). MeshFrame.xy is the flat box-pixel mesh: xy[2i],xy[2i+1] = vertex i,
// NaN if absent. Building a fresh SkPath per frame here is safe — the Reanimated runtime is GC'd.

const wireLoop = (xy: number[], idx: number[], close: boolean, p: SkPath) => {
  'worklet';
  let started = false;
  for (let i = 0; i < idx.length; i++) {
    const x = xy[2 * idx[i]];
    if (isNaN(x)) { continue; }
    const y = xy[2 * idx[i] + 1];
    if (!started) { p.moveTo(x, y); started = true; } else { p.lineTo(x, y); }
  }
  if (close && started) { p.close(); }
};

/** One combined SkPath tracing every facial contour, rebuilt on the UI thread from the live mesh. */
export function useFaceWire(f: SharedValue<MeshFrame | null>): SharedValue<SkPath> {
  return useDerivedValue(() => {
    const p = Skia.Path.Make();
    const xy = f.value?.xy;
    if (!xy) { return p; }
    for (let li = 0; li < FACE_LOOPS.length; li++) { wireLoop(xy, FACE_LOOPS[li].idx, FACE_LOOPS[li].close, p); }
    return p;
  });
}

/** Profile-safe full-face mask boundary: the dilated convex hull of the mesh — covers the nose +
 *  cheeks even in 3/4 / side views (where the face-oval contour lets them poke out). `dilate` expands
 *  it outward from the centroid (fraction of radius) to reach the skin edge. Subsamples the dense mesh
 *  for speed and always folds in the nose tip (idx 1) so it stays enclosed in profile. */
export function useHullPath(f: SharedValue<MeshFrame | null>, dilate = 0.12): SharedValue<SkPath> {
  return useDerivedValue(() => {
    const path = Skia.Path.Make();
    const xy = f.value?.xy;
    if (!xy) { return path; }
    const pts: Pt[] = [];
    for (let i = 0; i < xy.length; i += 10) { if (!isNaN(xy[i])) { pts.push({ x: xy[i], y: xy[i + 1] }); } }
    if (!isNaN(xy[2])) { pts.push({ x: xy[2], y: xy[3] }); } // nose tip (canonical idx 1)
    if (pts.length < 3) { return path; }
    let cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) { cx += pts[i].x; cy += pts[i].y; }
    cx /= pts.length; cy /= pts.length;
    pts.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower: Pt[] = [];
    for (let i = 0; i < pts.length; i++) { const q = pts[i]; while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) { lower.pop(); } lower.push(q); }
    const upper: Pt[] = [];
    for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) { upper.pop(); } upper.push(q); }
    lower.pop(); upper.pop();
    const hull = lower.concat(upper);
    if (hull.length < 3) { return path; }
    const k = 1 + dilate;
    const H = hull.map((v) => ({ x: cx + (v.x - cx) * k, y: cy + (v.y - cy) * k }));
    const n = H.length;
    const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const m0 = mid(H[n - 1], H[0]);
    path.moveTo(m0.x, m0.y);
    for (let i = 0; i < n; i++) { const cur = H[i]; const m = mid(cur, H[(i + 1) % n]); path.quadTo(cur.x, cur.y, m.x, m.y); }
    path.close();
    return path;
  });
}

/** Reactive face-oval (jaw) path — for clipping a fill to the face. */
export function useOvalPath(f: SharedValue<MeshFrame | null>): SharedValue<SkPath> {
  return useDerivedValue(() => {
    const p = Skia.Path.Make();
    const xy = f.value?.xy;
    if (xy) { wireLoop(xy, FACE_OVAL, true, p); }
    return p;
  });
}

/** Dense mesh vertices as a reactive point array — for <Points> when the lens animates point SIZE or
 *  needs a square cap (which the fixed-radius useDotPath can't do). Allocates on the (GC'd) UI thread. */
export function useMeshPoints(f: SharedValue<MeshFrame | null>): SharedValue<Pt[]> {
  return useDerivedValue(() => {
    const out: Pt[] = [];
    const xy = f.value?.xy;
    if (xy) { for (let i = 0; i < xy.length; i += 2) { if (!isNaN(xy[i])) { out.push({ x: xy[i], y: xy[i + 1] }); } } }
    return out;
  });
}

/** Dense mesh vertices as one fillable dot path (radius r) — the reactive equivalent of <Points>. */
export function useDotPath(f: SharedValue<MeshFrame | null>, r = 1.4): SharedValue<SkPath> {
  return useDerivedValue(() => {
    const p = Skia.Path.Make();
    const xy = f.value?.xy;
    if (xy) { for (let i = 0; i < xy.length; i += 2) { if (!isNaN(xy[i])) { p.addCircle(xy[i], xy[i + 1], r); } } }
    return p;
  });
}

/** The face transform (translate→eye-mid, rotate→roll, scale→faceW) for accessory art drawn in unit
 *  space — the reactive equivalent of the `tf` array accessory lenses build. Collapses with no face. */
export function useFaceTransform(f: SharedValue<MeshFrame | null>) {
  return useDerivedValue(() => {
    const ff = f.value;
    if (!ff) { return [{ scale: 0 }] as const; }
    return [{ translateX: ff.eyeMid.x }, { translateY: ff.eyeMid.y }, { rotate: (ff.rollDeg * Math.PI) / 180 }, { scale: ff.faceW }] as const;
  });
}

/** Reactive glowing wireframe — the MeshWire equivalent. Mounts once; the path updates on the UI thread.
 *  `width` may be a number or a SharedValue<number> (for mouthOpen-driven thickness etc.). */
export function MeshWireRx({ f, color, width = 2.5, blur = 6, core, opacity = 1 }: {
  f: SharedValue<MeshFrame | null>; color: SkColor; width?: number | SharedValue<number>;
  blur?: number; core?: string; opacity?: number;
}) {
  const path = useFaceWire(f);
  const coreW = useDerivedValue(() => Math.max(0.7, (typeof width === 'number' ? width : width.value) * 0.35));
  return (
    <Group opacity={opacity}>
      <Path path={path} style="stroke" strokeWidth={width} strokeJoin="round" strokeCap="round" color={color}>
        <BlurMask blur={blur} style="solid" />
      </Path>
      {core && <Path path={path} style="stroke" strokeWidth={coreW} strokeJoin="round" strokeCap="round" color={core} />}
    </Group>
  );
}
