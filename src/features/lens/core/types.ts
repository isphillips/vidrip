import type React from 'react';
import type { SharedValue } from 'react-native-reanimated';

// ─── Face landmarks (the contract the native MediaPipe plugin must satisfy) ────
// All points normalized 0..1 within the displayed frame (top-left origin). The plugin reduces
// MediaPipe's detection to these anchors; lenses are positioned from them.

export type Pt = { x: number; y: number };

export type FaceLandmarks = {
  leftEye: Pt;       // subject's left eye (screen-right when facing camera, mirror handled upstream)
  rightEye: Pt;
  noseTip: Pt;
  mouthCenter: Pt;
  faceWidth: number; // normalized cheek-to-cheek width
  roll: number;      // head tilt in radians (atan2 across the eyes)
  // Full 478-pt mesh in the SAME normalized preview space as the anchors (orientation/mirror already
  // applied). Opt-in (mesh lenses) — undefined unless useFaceTracking(_, withMesh) requested it. Dense
  // (all 478) live; sparse (only contour indices populated) when rebuilt from a replay track.
  mesh?: (Pt | undefined)[];
};

// Pixel-space anchors for a given box, derived from normalized landmarks.
export type FaceFrame = {
  le: Pt; re: Pt; eyeMid: Pt; eyeDist: number;
  nose: Pt; mouth: Pt; faceW: number; rollDeg: number;
  // Unit vectors in pixel space that follow the head's tilt: `along` points from the subject's
  // right eye toward the left eye, `up` points toward the top of the head. Lenses offset their
  // art along these (via `off`) so hats/ears/cheeks stay glued as the head rolls.
  up: Pt; along: Pt;
  // Mouth-open estimate, 0 (closed) → 1 (wide). On the mesh track this is the `jawOpen` blendshape
  // (reliable); on BlazeFace it falls back to the nose↔mouth gap vs eye spacing. Lenses use it to
  // trigger effects (fire/rainbow breath) and scale their intensity.
  mouthOpen: number;
  // Expression signals (0..1), derived from mesh geometry (undefined when no mesh — e.g. anchor-only
  // gesture lenses or replay without mesh). Lenses should treat undefined as "unsupported".
  smile?: number;     // mouth-corner width vs rest
  browRaise?: number; // brow ↔ eye gap vs rest
  // Mesh in box-pixel space (cover-crop applied), when requested. `mesh` keeps canonical indexing
  // (sparse on replay) for contour lookups; `meshPts` is the dense list of present points for drawing
  // a node cloud (Skia Points can't take holes).
  mesh?: (Pt | undefined)[];
  meshPts?: Pt[];
};

// The props every lens component receives: the live FaceFrame, the shared animation clock, and the
// canvas size.
export type LensProps = { f: FaceFrame; clock: SharedValue<number>; w: number; h: number };

// Reactive payload for the mesh lenses: every FaceFrame anchor (so a lens can still position art via
// eyeMid/up/along/off etc.) but with the heavy nested mesh/meshPts replaced by ONE flat pixel array
// `xy` (xy[2i],xy[2i+1] = vertex i in box pixels, NaN if absent). Flat numbers clone into the UI-thread
// SharedValue far faster than 478 nested {x,y} objects. Built by meshFrameFor() (full faceFrame mapping).
export type MeshFrame = Omit<FaceFrame, 'mesh' | 'meshPts'> & { xy: number[] };

// Reactive variant: `f` is a UI-thread SharedValue instead of a plain value. The lens reads it via
// useDerivedValue, so it mounts ONCE and updates with NO React re-render — the per-frame mesh render
// runs entirely on the UI thread (GC-managed Reanimated runtime, so no frame-processor leak risk). Used
// by mesh lenses migrated off the React reconcile path (see ReactiveLensHost in faceLens.tsx).
export type ReactiveLensProps = { f: SharedValue<MeshFrame | null>; clock: SharedValue<number>; w: number; h: number };

// A catalog entry. `warp` (when set) names a camera-pixel-bending shader (see warpLens.ts) rather
// than an overlay — the capture screen renders that shader via the warp frame processor instead of
// mounting `Comp` (`Comp` is still used for replay, since the warp isn't baked into recordings yet).
// `icon` is the Ionicons glyph shown in the picker.
// Shader programs routed through the camera-pixel pipeline (warpLens.ts). `eyes`…`kaleido` are the
// fun-house warps; `smooth`/`glow` are beauty skin-retouch passes (no face needed). The pipeline only
// cares that each names a compiled effect — the `beauty` flag decides which picker tab it shows in.
export type WarpKey = 'eyes' | 'bighead' | 'tinyface' | 'swirl' | 'glitch' | 'kaleido' | 'smooth' | 'glow';
// `mesh: true` lenses render from the full 478-pt face mesh (FaceFrame.mesh) — the capture screen
// requests the heavier mesh payload only while one of these (or Debug) is active. `gesture: true`
// marks lenses driven by a facial action (open mouth, etc.). `beauty: true` marks face-flattering
// retouch/makeup lenses (skin-smooth via `warp`, or makeup via the mesh overlay). These flags drive
// the picker tabs (see lensCategory).
// `Comp` is the legacy plain-FaceFrame renderer. It's OPTIONAL because lenses migrated to the reactive
// UI-thread path (registered in faceLens' REACTIVE_RENDERERS) render via their `*Rx` for BOTH live and
// bake and need no legacy renderer at all.
export type Lens = { key: string; label: string; icon: string; Comp?: React.FC<LensProps>; warp?: WarpKey; mesh?: boolean; gesture?: boolean; beauty?: boolean };

// Picker grouping. Derived from the flags above (see lensCategory): beauty retouch/makeup, warp
// pixels, mesh-driven, gesture-driven, or a plain overlay.
export type LensCategory = 'beauty' | 'mesh' | 'warp' | 'overlay' | 'gesture';

// ─── Replay ──────────────────────────────────────────────────────────────────
// A recorded reaction stores its lens as { lensId + a per-frame landmark track } captured during
// recording. On playback we sample the track at the clip's current time and render the lens over the
// (raw) reaction video — so the selfie stays clean and the lens is editable/removable.
export type FaceLensTrack = {
  lensId: string;
  fps: number;
  frames: (FaceLandmarks | null)[]; // null where no face was detected that frame
  frameAspect?: number;             // recorded camera-frame aspect (w/h) for cover-crop mapping
  // Mesh lenses only: the canonical contour indices captured (constant) + per-frame quantized points
  // (aligned with `frames`; null where no mesh). Rebuilt into a sparse mesh on replay. Kept compact —
  // only the contour subset, ×1000 ints — so it survives in the per-clip recipe JSON column.
  meshIdx?: number[];
  meshFrames?: (number[] | null)[];
};
