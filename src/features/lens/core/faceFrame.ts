import type { FaceFrame, FaceLandmarks, Pt } from './types';

// Offset a base anchor by `upD` pixels toward the top of the head and `sideD` pixels along the eye
// axis (positive = toward the subject's left eye / screen-left when mirrored). Negative `upD` goes
// down toward the chin. Keeps lens art locked to the face through head roll.
export function off(f: FaceFrame, base: Pt, upD: number, sideD: number): Pt {
  return { x: base.x + f.up.x * upD + f.along.x * sideD, y: base.y + f.up.y * upD + f.along.y * sideD };
}

// Maps normalized frame landmarks into box pixels, accounting for the preview's COVER crop (the
// camera frame fills the box and the overflowing dimension is cropped). `frameAspect` is the
// displayed frame's width/height; without it we assume the frame fills the box exactly.
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
  const eyeMid = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2 };
  const mouth = { x: mx(lm.mouthCenter.x), y: my(lm.mouthCenter.y) };
  // Head "up" axis from the eyes→mouth line. The eye line alone is 180°-ambiguous (which eye is
  // `le` vs `re` flips it), which flipped every lens upside down; the mouth is reliably *below* the
  // eyes on the face, so eyeMid→mouth gives an unambiguous down/up. `up` → crown of head, `along` →
  // head's right axis. `rollDeg` is how far `up` is rotated from screen-up.
  const dx = eyeMid.x - mouth.x, dy = eyeMid.y - mouth.y;
  const dl = Math.hypot(dx, dy) || 1;
  const up = { x: dx / dl, y: dy / dl };
  const along = { x: -up.y, y: up.x };
  const nose = { x: mx(lm.noseTip.x), y: my(lm.noseTip.y) };
  const eyeDist = Math.hypot(re.x - le.x, re.y - le.y);
  // Mouth-open proxy: the nose→mouth gap grows as the jaw drops. Normalize by eye spacing (so it's
  // scale-invariant) and remap the rest→open range to 0..1. Rough/per-person, but enough to trigger.
  const noseMouth = Math.hypot(nose.x - mouth.x, nose.y - mouth.y);
  const openRaw = eyeDist > 0 ? noseMouth / eyeDist : 0;
  // Remap the closed→open ratio to 0..1. REST/RANGE are rough (per-person): a closed mouth sits near
  // ~0.4× eye-spacing, wide open ~0.7×. Tune these two if breath effects trigger too early/late.
  const OPEN_REST = 0.45, OPEN_RANGE = 0.25;
  const mouthOpen = Math.max(0, Math.min(1, (openRaw - OPEN_REST) / OPEN_RANGE));
  return {
    le, re,
    eyeMid,
    eyeDist,
    nose,
    mouth,
    faceW: lm.faceWidth * sx,
    rollDeg: (Math.atan2(up.x, -up.y) * 180) / Math.PI,
    along,
    up,
    mouthOpen,
  };
}
