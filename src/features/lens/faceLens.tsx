import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// ─── Face landmarks (the contract the native MediaPipe plugin must satisfy) ────
// All points normalized 0..1 within the displayed frame (top-left origin). The plugin
// reduces MediaPipe's 468-point mesh to these anchors; lenses are positioned from them.

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
};

// Maps normalized frame landmarks into box pixels, accounting for the preview's COVER crop
// (the camera frame fills the box and the overflowing dimension is cropped). `frameAspect` is
// the displayed frame's width/height; without it we assume the frame fills the box exactly.
export function faceFrame(lm: FaceLandmarks, w: number, h: number, frameAspect?: number): FaceFrame {
  const boxAspect = h > 0 ? w / h : 1;
  let sx = w, sy = h, ox = 0, oy = 0;
  if (frameAspect && frameAspect > 0) {
    if (frameAspect > boxAspect) { sy = h; sx = h * frameAspect; ox = (sx - w) / 2; } // wider → crop sides
    else { sx = w; sy = w / frameAspect; oy = (sy - h) / 2; }                          // taller → crop top/bottom
  }
  const mx = (x: number) => x * sx - ox;
  const my = (y: number) => y * sy - oy;
  const le = { x: mx(lm.leftEye.x), y: my(lm.leftEye.y) };
  const re = { x: mx(lm.rightEye.x), y: my(lm.rightEye.y) };
  return {
    le, re,
    eyeMid: { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 },
    eyeDist: Math.hypot(re.x - le.x, re.y - le.y),
    nose: { x: mx(lm.noseTip.x), y: my(lm.noseTip.y) },
    mouth: { x: mx(lm.mouthCenter.x), y: my(lm.mouthCenter.y) },
    faceW: lm.faceWidth * sx,
    rollDeg: (Math.atan2(re.y - le.y, re.x - le.x) * 180) / Math.PI,
  };
}

// Places content centered at (cx,cy), rotated by the head roll. Content is authored around
// its own center; sizes scale with the face so a lens tracks distance.
function Anchor({ cx, cy, rollDeg, children }: { cx: number; cy: number; rollDeg: number; children: React.ReactNode }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: cx, top: cy, transform: [{ rotate: `${rollDeg}deg` }] }}>
      {children}
    </View>
  );
}

// An emoji glyph centered exactly on the anchor origin. A bare <Text> drops the glyph well below
// its top-left (line ascent + emoji baseline sit low), which made eye emoji land near the mouth —
// pinning it in a size×size box with centered line metrics fixes that.
function Emoji({ glyph, size }: { glyph: string; size: number }) {
  return (
    <Text
      style={{
        position: 'absolute', left: -size / 2, top: -size / 2,
        width: size, height: size, fontSize: size * 0.82, lineHeight: size,
        textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false,
      }}>
      {glyph}
    </Text>
  );
}

// ─── Lens catalog ──────────────────────────────────────────────────────────────
// Each lens draws from a FaceFrame. Starter set uses simple drawn shapes/emoji (no art
// assets yet) — swap in PNG/Skia art per lens later; the anchoring math stays the same.

export type Lens = { key: string; label: string; render: (f: FaceFrame) => React.ReactNode };

// A labelled marker for calibrating the landmark transform — tells us exactly where each
// anchor lands so we can fix any rotation/mirror without guessing on symmetric lenses.
function Marker({ p, color, label }: { p: Pt; color: string; label: string }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: p.x - 9, top: p.y - 9 }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color, borderWidth: 2, borderColor: '#fff' }} />
      <Text style={{ position: 'absolute', left: 20, top: -1, color: '#fff', fontSize: 13, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 3 }}>{label}</Text>
    </View>
  );
}

export const LENSES: Lens[] = [
  {
    key: 'debug', label: 'Debug',
    render: (f) => (
      <>
        <Marker p={f.le} color="#22ff22" label="L eye" />
        <Marker p={f.re} color="#ff2222" label="R eye" />
        <Marker p={f.nose} color="#3388ff" label="nose" />
        <Marker p={f.mouth} color="#ffdd22" label="mouth" />
      </>
    ),
  },
  {
    key: 'glasses', label: 'Shades',
    render: (f) => {
      const w = f.eyeDist * 2.4, h = f.eyeDist * 0.9;
      return (
        <Anchor cx={f.eyeMid.x} cy={f.eyeMid.y} rollDeg={f.rollDeg}>
          <View style={[s.shades, { left: -w / 2, top: -h / 2, width: w, height: h, borderRadius: h / 2 }]} />
        </Anchor>
      );
    },
  },
  {
    key: 'dog', label: 'Dog',
    render: (f) => {
      const ear = f.faceW * 0.42;
      // Ears above the eyes, splayed to the sides; nose on the nose tip.
      return (
        <>
          <Anchor cx={f.eyeMid.x} cy={f.eyeMid.y - f.faceW * 0.55} rollDeg={f.rollDeg}>
            <Emoji glyph="🐶" size={ear} />
          </Anchor>
          <Anchor cx={f.nose.x} cy={f.nose.y} rollDeg={f.rollDeg}>
            <View style={[s.dogNose, { left: -ear * 0.18, top: -ear * 0.14, width: ear * 0.36, height: ear * 0.28, borderRadius: ear * 0.18 }]} />
          </Anchor>
        </>
      );
    },
  },
  {
    key: 'hearts', label: 'Heart Eyes',
    render: (f) => {
      const sz = f.eyeDist * 0.9;
      return (
        <>
          <Anchor cx={f.le.x} cy={f.le.y} rollDeg={f.rollDeg}><Emoji glyph="😍" size={sz} /></Anchor>
          <Anchor cx={f.re.x} cy={f.re.y} rollDeg={f.rollDeg}><Emoji glyph="😍" size={sz} /></Anchor>
        </>
      );
    },
  },
  {
    key: 'crown', label: 'Crown',
    render: (f) => {
      const sz = f.faceW * 0.7;
      return (
        <Anchor cx={f.eyeMid.x} cy={f.eyeMid.y - f.faceW * 0.7} rollDeg={f.rollDeg}>
          <Emoji glyph="👑" size={sz} />
        </Anchor>
      );
    },
  },
];

export const lensByKey = (k?: string | null) => (k ? LENSES.find(l => l.key === k) : undefined);

// ─── Overlay ─────────────────────────────────────────────────────────────────
// Renders the active lens anchored to the current landmarks, sized to the box. Renders
// nothing when there's no face. (For 60fps live tracking the native plugin should drive a
// shared value; this prop form is fine for the editor preview + replay/bake frame stepping.)
export default function FaceLensOverlay({
  lens, landmarks, width, height, frameAspect,
}: { lens?: string | null; landmarks?: FaceLandmarks | null; width: number; height: number; frameAspect?: number }) {
  const def = lensByKey(lens);
  if (!def || !landmarks || width <= 0 || height <= 0) { return null; }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {def.render(faceFrame(landmarks, width, height, frameAspect))}
    </View>
  );
}

// ─── Replay ──────────────────────────────────────────────────────────────────
// A recorded reaction stores its lens as { lensId + a per-frame landmark track } captured
// during recording. On playback we sample the track at the clip's current time and render
// the lens over the (raw) reaction video — so the selfie stays clean and the lens is
// editable/removable, consistent with the rest of the replay model. (Track is produced by
// the native MediaPipe plugin during recording — pending.)

export type FaceLensTrack = {
  lensId: string;
  fps: number;
  frames: (FaceLandmarks | null)[]; // null where no face was detected that frame
  frameAspect?: number;             // recorded camera-frame aspect (w/h) for cover-crop mapping
};

export function FaceLensReplay({
  track, timeSec, width, height, frameAspect,
}: { track?: FaceLensTrack | null; timeSec: number; width: number; height: number; frameAspect?: number }) {
  if (!track || track.frames.length === 0) { return null; }
  let i = Math.round(timeSec * track.fps);
  if (i < 0) { i = 0; }
  if (i >= track.frames.length) { i = track.frames.length - 1; }
  return (
    <FaceLensOverlay
      lens={track.lensId}
      landmarks={track.frames[i]}
      width={width}
      height={height}
      frameAspect={frameAspect ?? track.frameAspect}
    />
  );
}

const s = StyleSheet.create({
  shades:  { position: 'absolute', backgroundColor: '#0a0a0a', borderWidth: 2, borderColor: '#222' },
  dogNose: { position: 'absolute', backgroundColor: '#1a1a1a' },
});
