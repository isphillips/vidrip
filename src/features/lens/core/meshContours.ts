import { Skia, type SkPath } from '@shopify/react-native-skia';
import type { Pt } from './types';

// Canonical MediaPipe FaceMesh contour index loops (ordered for drawing as polylines), over the
// 478-pt mesh exposed as FaceFrame.mesh (pixel space). Used by the mesh lenses to stroke/fill the
// face's features. These index sequences are the well-known FaceMesh connection sets.
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
export const RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
// Upper lash line only (outer corner → inner corner), a subset of the eye loops above. Used to draw
// eyeliner along the top lid and to extrude the eyeshadow region up toward the brow.
export const RIGHT_UPPER_LID = [33, 246, 161, 160, 159, 158, 157, 173, 133];
export const LEFT_UPPER_LID = [263, 466, 388, 387, 386, 385, 384, 398, 362];
export const LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
export const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
export const RIGHT_BROW = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107];
export const LEFT_BROW = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336];
export const NOSE_BRIDGE = [168, 6, 197, 195, 5, 4, 1];

// Build a Skia path tracing `loop` (a list of mesh indices) over `mesh`. `close` joins the last point
// back to the first (for rings like the eyes/lips/oval). Skips missing vertices (the replay mesh is a
// sparse subset). Returns an empty path if the mesh is absent.
export function meshPath(mesh: (Pt | undefined)[] | undefined, loop: number[], close = true): SkPath {
  const p = Skia.Path.Make();
  if (!mesh) { return p; }
  let started = false;
  for (let i = 0; i < loop.length; i++) {
    const v = mesh[loop[i]];
    if (!v) { continue; }
    if (!started) { p.moveTo(v.x, v.y); started = true; } else { p.lineTo(v.x, v.y); }
  }
  if (close && started) { p.close(); }
  return p;
}

// ─── Replay-track encoding ───────────────────────────────────────────────────
// The full 478-pt mesh is far too big for the per-clip recipe (a DB JSON column). For replay we
// persist only the union of contour indices the mesh lenses actually draw — enough for the wireframe,
// rims, and a representative node cloud — quantized to ×1000 integers (compact JSON). MESH_VERTS is
// the canonical mesh size; the rebuilt replay mesh is sparse (only these indices populated).
export const MESH_VERTS = 478;
export const MESH_TRACK_INDICES: number[] = Array.from(new Set([
  ...FACE_OVAL, ...RIGHT_EYE, ...LEFT_EYE, ...LIPS_OUTER, ...LIPS_INNER, ...RIGHT_BROW, ...LEFT_BROW, ...NOSE_BRIDGE,
]));

/** Flat-quantize the picked indices' points (normalized 0..1) to ×1000 integers: [x0,y0,x1,y1,...]. */
export function quantizeMesh(mesh: (Pt | undefined)[], indices: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < indices.length; i++) {
    const p = mesh[indices[i]];
    out.push(p ? Math.round(p.x * 1000) : 0, p ? Math.round(p.y * 1000) : 0);
  }
  return out;
}

/** Rebuild a sparse MESH_VERTS-length mesh (only `indices` populated) from a quantized frame. */
export function dequantizeMesh(q: number[], indices: number[]): (Pt | undefined)[] {
  const mesh: (Pt | undefined)[] = new Array(MESH_VERTS);
  for (let i = 0; i < indices.length; i++) {
    mesh[indices[i]] = { x: q[i * 2] / 1000, y: q[i * 2 + 1] / 1000 };
  }
  return mesh;
}
