import React from 'react';
import { Group, Rect, Path, Skia, Circle, RadialGradient, BlurMask, vec, type SkPath } from '@shopify/react-native-skia';
import { off, WorldVignette, type LensProps, type Pt } from '../core';
import { ANON_FLOOR } from '../useAnonymousMode';

// "React Anonymously" — the anonymous-source look: the whole scene is crushed dark and the wearer
// becomes a featureless black bust (head + shoulders) with a cool backlit rim, like an interview
// subject hidden in shadow. Drawn from the face mesh so it tracks the head, and baked into the
// recording through the normal capture-bake path.
//
// The head is the CONVEX HULL of the mesh points, dilated outward by a fixed margin and smoothed — so
// it bulges past the nose even in 3/4 / profile views (the nose tip is always a hull vertex, and the
// margin keeps it inside). A plain face-oval let the nose poke through when turning left/right.
//
// NOTE: this is a *stylized* obscure, not a hard guarantee — it depends on the face being tracked.
// If the mesh is lost we fail safe by blacking out the whole frame. A bulletproof version (works with
// no face, hides the full body) needs person segmentation or a native full-frame blur (see plan).
const INK = '#04060A';

// Andrew's monotone-chain convex hull. Returns the boundary points in order (closed polygon).
function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (p.length < 3) { return p; }
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) { lower.pop(); } lower.push(q); }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) { upper.pop(); } upper.push(q); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// A smooth closed path through the polygon — quad curves vertex→edge-midpoint so corners round off.
function smoothClosedPath(pts: Pt[]): SkPath {
  const p = Skia.Path.Make();
  const n = pts.length;
  if (n < 3) { return p; }
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const m0 = mid(pts[n - 1], pts[0]);
  p.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) { const cur = pts[i]; const m = mid(cur, pts[(i + 1) % n]); p.quadTo(cur.x, cur.y, m.x, m.y); }
  p.close();
  return p;
}

export function Silhouette({ f, w, h }: LensProps) {
  // Fail safe: no face tracked → black the frame entirely rather than risk showing an identifiable face.
  if (!f.mesh || !f.meshPts || f.meshPts.length < 8) {
    return <Rect x={0} y={0} width={w} height={h} color="rgba(0,0,0,1)" />;
  }

  const cx = f.eyeMid.x, cy = f.eyeMid.y;
  // Pivot a little above the eyes (toward the forehead) so the dome grows upward over the hair.
  const py = cy - f.faceW * 0.12;
  const margin = f.faceW * 0.14;                 // fixed outward dilation → keeps the nose tucked inside
  const head = convexHull(f.meshPts).map((pt) => {
    const vx = pt.x - cx, vy = pt.y - py;
    const sy = vy < 0 ? 1.55 : 1.25;             // taller above (skull/hair), fuller below (jaw)
    const qx = cx + vx * 1.22, qy = py + vy * sy;
    const dvx = qx - cx, dvy = qy - py, len = Math.hypot(dvx, dvy) || 1;
    return { x: qx + (dvx / len) * margin, y: qy + (dvy / len) * margin };
  });
  const headPath = smoothClosedPath(head);

  // Shoulders: a gravity-aligned bust widening from the neck to the bottom of the frame.
  const chin = off(f, f.mouth, -f.faceW * 0.5, 0);
  const neck = f.faceW * 0.5, shoulder = f.faceW * 1.7;
  const shoulders = (() => {
    const p = Skia.Path.Make();
    p.moveTo(chin.x - neck, chin.y);
    p.quadTo(chin.x - shoulder, chin.y + f.faceW * 0.45, chin.x - shoulder, h);
    p.lineTo(chin.x + shoulder, h);
    p.quadTo(chin.x + shoulder, chin.y + f.faceW * 0.45, chin.x + neck, chin.y);
    p.close();
    return p;
  })();

  return (
    <>
      {/* fully hide the scene behind an opaque dark floor — identical to the bake stage's floor, so
          the live preview matches the recorded result exactly */}
      <Rect x={0} y={0} width={w} height={h} color={ANON_FLOOR} />
      <WorldVignette w={w} h={h} colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.5)']} />

      {/* cool backlight behind the head — reads as the rim/halo once the dark head covers its centre */}
      <Circle cx={cx} cy={cy - f.faceW * 0.32} r={f.faceW * 1.9} opacity={0.8}>
        <RadialGradient c={vec(cx, cy - f.faceW * 0.22)} r={f.faceW * 1.7} colors={['rgba(125,155,205,0.5)', 'rgba(35,55,95,0)']} />
        <BlurMask blur={32} style="normal" />
      </Circle>

      {/* the bust */}
      <Group>
        <Path path={shoulders} color={INK} />
        <Path path={shoulders} style="stroke" strokeWidth={3} color="rgba(150,180,225,0.4)"><BlurMask blur={3} style="normal" /></Path>
      </Group>
      <Path path={headPath} color={INK} />
      <Path path={headPath} style="stroke" strokeWidth={2.5} color="rgba(155,185,230,0.5)"><BlurMask blur={2.5} style="normal" /></Path>
    </>
  );
}
