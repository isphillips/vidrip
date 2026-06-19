import type { FaceFrame, FaceLandmarks, Pt } from './types';

// Hysteresis for the head "up" axis. The eyes→mouth vector foreshortens when the head pitches up or
// down and can briefly INVERT (the mouth crossing the eye line), which snapped lenses a full 180°.
// We remember the last up direction and (a) hold it while the vector is too short to trust, and
// (b) refuse a sudden >90° flip (an artifact) — real head roll changes <90° per frame, so it passes.
let _lastUp: Pt | null = null;
let _lastEyeMid: Pt | null = null;

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
  const eyeDist = Math.hypot(re.x - le.x, re.y - le.y);
  // Head "up" axis from the eyes→mouth line (mouth is reliably below the eyes → unambiguous down/up).
  const dx = eyeMid.x - mouth.x, dy = eyeMid.y - mouth.y;
  const dl = Math.hypot(dx, dy);
  let up = dl > 0 ? { x: dx / dl, y: dy / dl } : { x: 0, y: -1 };
  // Stabilize: reset on re-acquire (face jumped); otherwise hold the prior up when the eyes→mouth
  // vector is too short to trust (steep pitch) or when the candidate would flip >90° (foreshortening
  // artifact, not a real head inversion). Real roll moves <90°/frame and passes through.
  const jumped = !_lastEyeMid || Math.hypot(eyeMid.x - _lastEyeMid.x, eyeMid.y - _lastEyeMid.y) > eyeDist * 1.5;
  if (!jumped && _lastUp) {
    const tooShort = dl < eyeDist * 0.25;
    const flipped = up.x * _lastUp.x + up.y * _lastUp.y < 0;
    if (tooShort || flipped) { up = _lastUp; }
  }
  _lastUp = up;
  _lastEyeMid = eyeMid;
  // `up` → crown of head, `along` → head's right axis. `rollDeg` is how far `up` is from screen-up.
  const along = { x: -up.y, y: up.x };
  const nose = { x: mx(lm.noseTip.x), y: my(lm.noseTip.y) };
  // Mouth-open proxy: the nose→mouth gap grows as the jaw drops. Normalize by eye spacing (so it's
  // scale-invariant) and remap the rest→open range to 0..1. Rough/per-person, but enough to trigger.
  const noseMouth = Math.hypot(nose.x - mouth.x, nose.y - mouth.y);
  const openRaw = eyeDist > 0 ? noseMouth / eyeDist : 0;
  // Remap the closed→open ratio to 0..1. REST/RANGE are rough (per-person): a closed mouth sits near
  // ~0.4× eye-spacing, wide open ~0.7×. Tune these two if breath effects trigger too early/late.
  const OPEN_REST = 0.45, OPEN_RANGE = 0.25;
  let mouthOpen = Math.max(0, Math.min(1, (openRaw - OPEN_REST) / OPEN_RANGE));
  // Mesh track: blendshapes beat the geometric proxy. jawOpen rarely exceeds ~0.5 even wide-open, so
  // remap (rest ~0.05 → open ~0.5) to a full 0..1. blink/smile/browRaise pass through for lenses that
  // want them (undefined on BlazeFace/replay).
  let blink: number | undefined, smile: number | undefined, browRaise: number | undefined;
  if (lm.bs) {
    mouthOpen = Math.max(0, Math.min(1, (lm.bs.jawOpen - 0.05) / 0.45));
    blink = (lm.bs.blinkL + lm.bs.blinkR) / 2;
    smile = lm.bs.smile;
    browRaise = lm.bs.browUp;
  }
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
    blink,
    smile,
    browRaise,
    // Map into box pixels; keep canonical indexing (sparse on replay → guard holes), and a dense list
    // of present points for Skia Points (which can't take holes).
    mesh: lm.mesh ? lm.mesh.map((p) => (p ? { x: mx(p.x), y: my(p.y) } : undefined)) : undefined,
    meshPts: lm.mesh ? (lm.mesh.filter(Boolean) as Pt[]).map((p) => ({ x: mx(p.x), y: my(p.y) })) : undefined,
  };
}
