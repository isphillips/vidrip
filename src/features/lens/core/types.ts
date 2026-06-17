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
};

// Pixel-space anchors for a given box, derived from normalized landmarks.
export type FaceFrame = {
  le: Pt; re: Pt; eyeMid: Pt; eyeDist: number;
  nose: Pt; mouth: Pt; faceW: number; rollDeg: number;
  // Unit vectors in pixel space that follow the head's tilt: `along` points from the subject's
  // right eye toward the left eye, `up` points toward the top of the head. Lenses offset their
  // art along these (via `off`) so hats/ears/cheeks stay glued as the head rolls.
  up: Pt; along: Pt;
  // Mouth-open estimate, 0 (closed) → 1 (wide). Derived from the nose↔mouth gap vs eye spacing — the
  // only facial-interaction signal BlazeFace's 6 keypoints afford. Lenses use it to trigger effects
  // (fire/rainbow breath) and scale their intensity.
  mouthOpen: number;
};

// The props every lens component receives: the live FaceFrame, the shared animation clock, and the
// canvas size.
export type LensProps = { f: FaceFrame; clock: SharedValue<number>; w: number; h: number };

// A catalog entry. `warp` (when set) names a camera-pixel-bending shader (see warpLens.ts) rather
// than an overlay — the capture screen renders that shader via the warp frame processor instead of
// mounting `Comp` (`Comp` is still used for replay, since the warp isn't baked into recordings yet).
// `icon` is the Ionicons glyph shown in the picker.
export type WarpKey = 'eyes' | 'bighead' | 'tinyface' | 'swirl';
export type Lens = { key: string; label: string; icon: string; Comp: React.FC<LensProps>; warp?: WarpKey };

// ─── Replay ──────────────────────────────────────────────────────────────────
// A recorded reaction stores its lens as { lensId + a per-frame landmark track } captured during
// recording. On playback we sample the track at the clip's current time and render the lens over the
// (raw) reaction video — so the selfie stays clean and the lens is editable/removable.
export type FaceLensTrack = {
  lensId: string;
  fps: number;
  frames: (FaceLandmarks | null)[]; // null where no face was detected that frame
  frameAspect?: number;             // recorded camera-frame aspect (w/h) for cover-crop mapping
};
