import type { FaceFrame, FaceLandmarks, MeshFrame, Pt } from './types';

// Rotation lock for the head "up" axis. The eyes→mouth vector foreshortens on steep pitch and can
// briefly INVERT or jump during fast motion / mis-detection, snapping lenses 90–180°. So we LOCK the
// committed axis: small, continuous changes (real head tilt) track responsively, but a SUDDEN new
// orientation is only adopted if it holds steady for ROT_HOLD_MS. Unreliable readings hold the lock.
let _up: Pt | null = null;     // committed (locked) up axis
let _cand: Pt | null = null;   // a sudden new direction currently under observation
let _candSince = 0;            // ms timestamp the candidate window started

// Per-frame change up to ~this many degrees = real head motion → track it; beyond = a jump to debounce.
const ROT_STEP_COS = Math.cos((30 * Math.PI) / 180);
// A candidate must stay within ~this cone of itself across the window to count as "steady".
const ROT_STABLE_COS = Math.cos((22 * Math.PI) / 180);
// How long a sudden/flipped orientation must persist before we accept it (the "few seconds" lock).
const ROT_HOLD_MS = 1500;
// How fast the committed axis follows raw during normal (small) rotation. 1 = instant/snappy (1:1,
// no added lag); lower (e.g. 0.6) trades snappiness for jitter smoothing. The jump-debounce below is
// what provides stability, so this can stay at 1 without losing flip protection.
const ROT_TRACK = 1.0;

const nrm = (p: Pt): Pt => { const l = Math.hypot(p.x, p.y) || 1; return { x: p.x / l, y: p.y / l }; };

// Offset a base anchor by `upD` pixels toward the top of the head and `sideD` pixels along the eye
// axis (positive = toward the subject's left eye / screen-left when mirrored). Negative `upD` goes
// down toward the chin. Keeps lens art locked to the face through head roll.
export function off(f: FaceFrame, base: Pt, upD: number, sideD: number): Pt {
  return { x: base.x + f.up.x * upD + f.along.x * sideD, y: base.y + f.up.y * upD + f.along.y * sideD };
}

// Lean mapping for the reactive mesh path: the cover-crop math from faceFrame() (so it lands EXACTLY
// where the overlay does), but emitting a flat pixel-coord array + the handful of anchors a mesh lens
// needs — no nested-object mesh, no rotation lock. Cheap to compute and cheap to push to the UI thread.
// Returns null when this frame has no mesh (anchor-only lenses don't use the reactive path).
export function meshFrameFor(lm: FaceLandmarks, w: number, h: number, frameAspect?: number): MeshFrame | null {
  const mesh = lm.mesh;
  if (!mesh) { return null; }
  const boxAspect = h > 0 ? w / h : 1;
  let sx = w, sy = h, ox = 0, oy = 0;
  if (frameAspect && frameAspect > 0) {
    if (frameAspect > boxAspect) { sy = h; sx = h * frameAspect; ox = (sx - w) / 2; }
    else { sx = w; sy = w / frameAspect; oy = (sy - h) / 2; }
  }
  const mx = (x: number) => x * sx - ox;
  const my = (y: number) => y * sy - oy;
  const xy = new Array<number>(mesh.length * 2);
  for (let i = 0; i < mesh.length; i++) {
    const p = mesh[i];
    if (p) { xy[2 * i] = mx(p.x); xy[2 * i + 1] = my(p.y); }
    else { xy[2 * i] = NaN; xy[2 * i + 1] = NaN; }
  }
  return {
    xy,
    noseX: mx(lm.noseTip.x), noseY: my(lm.noseTip.y),
    eyeMidY: (my(lm.leftEye.y) + my(lm.rightEye.y)) / 2,
    faceW: lm.faceWidth * sx,
  };
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
  const rawUp = dl > 0 ? nrm({ x: dx, y: dy }) : (_up ?? { x: 0, y: -1 });
  // Rotation lock: follow small continuous changes (real head tilt) immediately, but debounce sudden
  // jumps/flips — a glitch can't snap the lens; only a NEW orientation held steady for ROT_HOLD_MS wins.
  const tooShort = dl < eyeDist * 0.25;   // eyes→mouth foreshortened (steep pitch) → unreliable this frame
  const now = Date.now();
  if (!_up) {
    _up = rawUp; _cand = null;             // first acquisition — adopt immediately
  } else if (!tooShort) {
    const dotC = rawUp.x * _up.x + rawUp.y * _up.y;
    if (dotC >= ROT_STEP_COS) {
      // small per-frame change = real motion → track responsively
      _up = nrm({ x: _up.x + (rawUp.x - _up.x) * ROT_TRACK, y: _up.y + (rawUp.y - _up.y) * ROT_TRACK });
      _cand = null;
    } else if (_cand && rawUp.x * _cand.x + rawUp.y * _cand.y >= ROT_STABLE_COS) {
      // a sudden new orientation that's holding steady — keep timing it, adopt once it's persisted
      _cand = rawUp;
      if (now - _candSince >= ROT_HOLD_MS) { _up = rawUp; _cand = null; }
    } else {
      // sudden / unsteady jump → stay locked and (re)start the dwell window
      _cand = rawUp; _candSince = now;
    }
  } else {
    _cand = null;                          // unreliable reading — hold the lock, don't count it
  }
  const up = _up!;
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
  const mouthOpen = Math.max(0, Math.min(1, (openRaw - OPEN_REST) / OPEN_RANGE));
  // Expression signals from MESH GEOMETRY — we dropped MediaPipe's CPU blendshapes model (it ran every
  // frame for every lens just to feed these). mouthOpen keeps the anchor proxy above (works without the
  // mesh, for gesture lenses that don't request it); smile/browRaise need the mesh, so they're only set
  // for mesh lenses — which are the only ones that consume them. Ratios are vs eyeDist (a stable scale
  // ref); REST/RANGE are rough first-pass values — tune on-device if a trigger fires too early/late.
  let smile: number | undefined, browRaise: number | undefined;
  if (lm.mesh && eyeDist > 0) {
    const pm = (i: number) => { const p = lm.mesh![i]; return p ? { x: mx(p.x), y: my(p.y) } : undefined; };
    const cr = pm(61), cl = pm(291);            // mouth corners → spacing widens with a smile
    if (cr && cl) { smile = Math.max(0, Math.min(1, (Math.hypot(cr.x - cl.x, cr.y - cl.y) / eyeDist - 0.95) / 0.55)); }
    const br = pm(105), ey = pm(159);           // right brow ↔ upper lid → gap grows when the brow lifts
    if (br && ey) { browRaise = Math.max(0, Math.min(1, (Math.hypot(br.x - ey.x, br.y - ey.y) / eyeDist - 0.42) / 0.32)); }
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
    smile,
    browRaise,
    // Map into box pixels; keep canonical indexing (sparse on replay → guard holes), and a dense list
    // of present points for Skia Points (which can't take holes).
    mesh: lm.mesh ? lm.mesh.map((p) => (p ? { x: mx(p.x), y: my(p.y) } : undefined)) : undefined,
    meshPts: lm.mesh ? (lm.mesh.filter(Boolean) as Pt[]).map((p) => ({ x: mx(p.x), y: my(p.y) })) : undefined,
  };
}
