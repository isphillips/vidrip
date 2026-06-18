import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useFrameProcessor, runAtTargetFps, VisionCameraProxy } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import type { FaceLandmarks, FaceLensTrack } from './faceLens';

// The two platforms feed MediaPipe differently, so the keypoints arrive in different conventions:
//  • iOS pins frame.orientation → coords are pre-rotated (rotated 90° + upside-down + mirrored vs the
//    preview) → needs the base map + eye-midpoint reflection + lift below.
//  • Android passes the RAW sensor image (no rotation) → coords are already ~upright (p0 = vertical
//    down, p1 = horizontal eye axis) → only the selfie mirror is needed; the reflection would flip it.
const IS_ANDROID = Platform.OS === 'android';

// Android only: constant normalized nudges to re-center the constellation after orientation mapping.
// DX: NEGATIVE = screen-LEFT. DY: NEGATIVE = screen-UP (markers sit low → lift them up).
const ANDROID_DX = 0;
const ANDROID_DY = -0.1;

// Replay sampling rate for the captured track — 15fps is plenty for an overlay and keeps the
// persisted track small.
const TRACK_FPS = 15;
// Cap live inference. The camera runs at 30fps; with the GPU delegate BlazeFace is cheap enough to
// run every frame. Lower this if a CPU-delegate device struggles.
const LIVE_FPS = 30;
const r3 = (n: number) => Math.round(n * 1000) / 1000; // trim serialized track size

type TrackSample = { t: number; lm: FaceLandmarks | null };
type TrackRec = { t0: number; lensId: string; frameAspect?: number; samples: TrackSample[] };

// Smoothing: EMA toward each new detection to kill BlazeFace's frame-to-frame flicker. iOS's
// centroid-reflection roughly doubles landmark jitter so it needs heavy easing; the Android path
// has no reflection AND a lower detection rate (CPU delegate), so heavy easing reads as "slow
// motion" — it runs much snappier to track each fresh detection directly.
const SMOOTH = IS_ANDROID ? 0.55 : 0.18;
const SNAP = 0.22;       // a jump bigger than this snaps instead of easing (re-acquire / fast move)
const DEADBAND = 0.008;  // below this much motion, hold the pose (don't chase micro-jitter)
// Hide debounce: when detection drops, hold the last pose and only hide once the face has been gone
// this long. Rides blinks / brief turns / single missed frames without strobing.
const HIDE_MS = 2000;

function ema(prev: FaceLandmarks, cur: FaceLandmarks, a: number): FaceLandmarks {
  const mix = (p: number, c: number) => p + (c - p) * a;
  const mixPt = (p: { x: number; y: number }, c: { x: number; y: number }) => ({ x: mix(p.x, c.x), y: mix(p.y, c.y) });
  return {
    leftEye: mixPt(prev.leftEye, cur.leftEye),
    rightEye: mixPt(prev.rightEye, cur.rightEye),
    noseTip: mixPt(prev.noseTip, cur.noseTip),
    mouthCenter: mixPt(prev.mouthCenter, cur.mouthCenter),
    faceWidth: mix(prev.faceWidth, cur.faceWidth),
    roll: mix(prev.roll, cur.roll),
  };
}

// The native plugin runs MediaPipe FaceDetector (BlazeFace) and returns 6 normalized keypoints:
//   { points: number[][] }  // [[x,y]×6], 0..1 in the raw buffer's coordinate space
let plugin: ReturnType<typeof VisionCameraProxy.initFrameProcessorPlugin> | undefined;
try { plugin = VisionCameraProxy.initFrameProcessorPlugin('faceLandmarks', {}); } catch { plugin = undefined; }

/** Whether the native MediaPipe plugin is present in this build (gate Camera frameProcessor on it). */
export const faceTrackingAvailable = !!plugin;

// BlazeFace keypoint indices (right/left as seen in the image).
const RIGHT_EYE = 0;
const LEFT_EYE = 1;
const NOSE_TIP = 2;
const MOUTH = 3;
const EAR_R = 4;
const EAR_L = 5;

// iOS PATH ONLY (the Android branch in reduce() returns before any of this).
// Markers sit one eye→mouth distance too low after the eye-midpoint un-flip (the eyes land where the
// mouth is). LIFT raises every anchor along the face-up axis to seat them on the eyes. It's a
// fraction of the inter-eye distance, applied perpendicular to the eye line (so it rotates with head
// tilt) — NOT in screen space, which would slide off-face on a tilt. Bigger = markers move UP toward
// the forehead, smaller = down toward the chin. ~1.0 ≈ one eye-spacing up.
const LIFT = 0.2;

// iOS PATH ONLY. BlazeFace's two eye keypoints have a small, consistent vertical offset (measured: a
// level face still reports the left eye ~0.02 lower than the right), which the portrait aspect
// amplifies into a visible ~10° lean — every filter looks crooked. ROLL_FIX rotates the whole
// constellation about the pivot (in screen-proportional space) to null it. It's a CONSTANT, so real
// head tilts still track on top of it. Degrees; flip the sign if it leans the wrong way.
const ROLL_FIX_DEG = 4;

// Map the 6 keypoints into preview-space anchors. roll stays 0 here — faceFrame() derives tilt from
// the eyeMid→mouth line, so getting the anchor positions right is all that's needed.
//
// HARD-WON CALIBRATION (don't re-derive — see face-lens-orientation-calibration memory):
// MediaPipe is fed the image WITH an orientation, so it returns coords in a fixed convention that's
// rotated 90° + upside-down + mirrored vs the preview (measured: move head right → raw p1 down; move
// up → raw p0 down).
//   1. Base map `x = 1 - p1, y = p0` tracks correctly.
//   2. Reflect both axes about the EYE MIDPOINT (2·c − v): un-inverts the upside-down arrangement +
//      applies the selfie mirror, while pivoting on the stable eye line so tilt tracks and the
//      jittery mouth keypoint never enters the transform.
//   3. The eye-midpoint pivot leaves everything one eye→mouth distance low, so LIFT raises it along
//      the face-up axis (see above) — the only fudge, and a face-relative one so tilt survives.
function reduce(points: number[][] | null | undefined, aspect: number, orientation: string, _mirrored: boolean): FaceLandmarks | null {
  'worklet';
  if (!points || points.length < 6) { return null; }

  // Android: native returns RAW sensor keypoints; their convention depends on the camera's mounting,
  // which a portrait-locked app sees as either 'landscape-left' or 'landscape-right'. Both are
  // verified empirically from on-device raw data (see face-lens-orientation-calibration memory):
  //   landscape-right (e.g. emulator): x = p1,     y = p0
  //   landscape-left  (e.g. OnePlus):  x = 1 - p1, y = 1 - p0   (a 180° flip — the two are 180° apart)
  // Already upright + selfie-mirrored — no reflection / lift / roll-fix.
  if (IS_ANDROID) {
    const ll = orientation === 'landscape-left';
    const a = (i: number) => {
      const p0 = points[i][0], p1 = points[i][1];
      const x = ll ? 1 - p1 : p1;
      const y = ll ? 1 - p0 : p0;
      return { x: x + ANDROID_DX, y: y + ANDROID_DY };
    };
    const le = a(LEFT_EYE), re = a(RIGHT_EYE), nose = a(NOSE_TIP), mouth = a(MOUTH);
    const er = a(EAR_R), el = a(EAR_L);
    return {
      leftEye: le, rightEye: re, noseTip: nose, mouthCenter: mouth,
      faceWidth: Math.hypot(el.x - er.x, el.y - er.y), roll: 0,
    };
  }

  const base = (i: number) => ({ x: 1 - points[i][1], y: points[i][0] });
  const le = base(LEFT_EYE), re = base(RIGHT_EYE), nose = base(NOSE_TIP), mouth = base(MOUTH);
  const earR = base(EAR_R), earL = base(EAR_L);
  const cx = (le.x + re.x) / 2, cy = (le.y + re.y) / 2; // eye-midpoint pivot
  const ref = (p: { x: number; y: number }) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y });
  const le2 = ref(le), re2 = ref(re), nose2 = ref(nose), mouth2 = ref(mouth);
  // Face-up lift, computed in SCREEN-PROPORTIONAL space. The frame is portrait, so normalized x is
  // squished vs y by `aspect`; a perpendicular taken in normalized space isn't perpendicular on
  // screen, and the squish skews it OPPOSITE ways for left vs right tilt (one side reads low).
  // Multiply x by `aspect` to undo the squish, do the perpendicular there, then divide x back out.
  const A = aspect > 0 ? aspect : 1;
  const ex = (re2.x - le2.x) * A, ey = re2.y - le2.y;          // eye vector, screen-proportional
  const elen = Math.hypot(ex, ey) || 1;
  let ux = -ey / elen, uy = ex / elen;                        // perpendicular (screen space)
  if (ux * (nose2.x - cx) * A + uy * (nose2.y - cy) > 0) { ux = -ux; uy = -uy; } // away from nose
  const lx = (ux * elen * LIFT) / A, ly = uy * elen * LIFT;   // back to normalized (undo x squish)
  // Lift, then rotate by the constant ROLL_FIX about the (lifted) pivot to null BlazeFace's eye-line
  // lean. Rotation is done in screen-proportional space (×A on x) so the leveling is true on screen.
  const pcx = cx + lx, pcy = cy + ly;
  const th = (ROLL_FIX_DEG * Math.PI) / 180;
  const cs = Math.cos(th), sn = Math.sin(th);
  const place = (p: { x: number; y: number }) => {
    const dx = (p.x + lx - pcx) * A, dy = p.y + ly - pcy;     // lift, then to pivot-relative screen space
    return { x: pcx + (dx * cs - dy * sn) / A, y: pcy + (dx * sn + dy * cs) };
  };
  return {
    leftEye: place(le2),
    rightEye: place(re2),
    noseTip: place(nose2),
    mouthCenter: place(mouth2),
    faceWidth: Math.hypot(earL.x - earR.x, earL.y - earR.y), // distance is reflection-invariant
    roll: 0,
  };
}

// Returns a frame processor (attach to <Camera frameProcessor={...}>) and the latest reduced
// landmarks. `mirror` true for the front camera. Returns landmarks=null (and a no-op processor) if
// the plugin isn't built yet.
export function useFaceTracking(mirror = true) {
  const [landmarks, setLandmarks] = useState<FaceLandmarks | null>(null);
  const [status, setStatus] = useState<string>('init'); // diagnostic: ok | null | <err>
  // The aspect (w/h, <1 for portrait) of the actual frame the keypoints are normalized to — measured
  // from the live frame, not guessed from `format` (which can differ from the delivered buffer and
  // makes the overlay's cover-crop mapping splay markers off-face toward the edges). 0 until known.
  const [frameAspect, setFrameAspect] = useState(0);
  const frameAspectRef = useRef(0);
  const statusRef = useRef('init');                 // avoid re-rendering on unchanged status
  const smoothRef = useRef<FaceLandmarks | null>(null); // running EMA-smoothed pose
  const lastGoodRef = useRef(0);                    // last frame a face was detected (hide debounce)
  const hiddenRef = useRef(true);                   // whether markers are currently hidden
  const recRef = useRef<TrackRec | null>(null);     // active capture (during recording)

  const push = useCallback((lm: FaceLandmarks | null, st: string) => {
    if (st !== statusRef.current) { statusRef.current = st; setStatus(st); }
    const now = Date.now();
    const rec = recRef.current;
    if (rec) { rec.samples.push({ t: now - rec.t0, lm }); }
    if (lm) {
      lastGoodRef.current = now;
      hiddenRef.current = false;
      const prev = smoothRef.current;
      // Motion = the largest displacement of any anchor (not just the nose — a head TILT pivots near
      // the nose, so the eyes carry the movement). Below the deadband we hold the pose.
      const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
      const moved = prev
        ? Math.max(d(lm.noseTip, prev.noseTip), d(lm.leftEye, prev.leftEye), d(lm.rightEye, prev.rightEye), d(lm.mouthCenter, prev.mouthCenter))
        : 1;
      if (prev && moved < DEADBAND) { return; }
      // Ease toward the detection; snap on first acquire or a big jump so markers don't crawl.
      const out = prev && moved < SNAP ? ema(prev, lm, SMOOTH) : lm;
      smoothRef.current = out;
      setLandmarks(out);
    } else if (!hiddenRef.current && now - lastGoodRef.current > HIDE_MS) {
      hiddenRef.current = true;
      smoothRef.current = null;
      setLandmarks(null);
    }
  }, []);
  const pushJs = Worklets.createRunOnJS(push);

  // Record the real frame aspect once (it doesn't change mid-session). Logged so we can confirm it
  // matches what the preview shows.
  const setAspect = useCallback((fa: number) => {
    if (fa > 0 && Math.abs(fa - frameAspectRef.current) > 0.001) {
      frameAspectRef.current = fa;
      setFrameAspect(fa);
    }
  }, []);
  const setAspectJs = Worklets.createRunOnJS(setAspect);

  // TEMP DIAGNOSTIC: log the frame orientation + raw keypoints ~1/sec to calibrate per-device.
  const dbgRef = useRef(0);
  const logRaw = useCallback((pts: number[][], orientation: string, mirrored: boolean, w: number, h: number) => {
    if (dbgRef.current++ % 30 !== 0) { return; }
    console.log('[faceTracking] ori', orientation, 'mirrored', mirrored, 'size', `${w}x${h}`,
      '| RE', pts[0].map(r3), 'LE', pts[1].map(r3), 'nose', pts[2].map(r3), 'mouth', pts[3].map(r3));
  }, []);
  const logRawJs = Worklets.createRunOnJS(logRaw);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!plugin) { return; }
    runAtTargetFps(LIVE_FPS, () => {
      'worklet';
      // min/max is rotation-invariant, so this is the displayed portrait aspect regardless of sensor
      // orientation — the true space the keypoints live in.
      const aspect = Math.min(frame.width, frame.height) / Math.max(frame.width, frame.height);
      setAspectJs(aspect);
      const ori = String(frame.orientation);
      const mir = !!frame.isMirrored;
      const res = plugin!.call(frame) as unknown as { points?: number[][]; err?: string } | null;
      if (res && res.points) {
        logRawJs(res.points, ori, mir, frame.width, frame.height);
        pushJs(reduce(res.points, aspect, ori, mir), 'ok');
      } else { pushJs(null, (res && res.err) || 'null'); }
    });
  }, [pushJs, setAspectJs, logRawJs, mirror]);

  // ── Track capture ──────────────────────────────────────────────────────────
  // Start when recording begins; stop returns a time-sampled FaceLensTrack to persist with the clip;
  // cancel discards. The selfie video is the timing master on replay, so samples are keyed to
  // recording-start and resampled to a fixed fps grid.
  const startTrack = useCallback((lensId: string, frameAspect?: number) => {
    recRef.current = { t0: Date.now(), lensId, frameAspect, samples: [] };
  }, []);
  const cancelTrack = useCallback(() => { recRef.current = null; }, []);
  const stopTrack = useCallback((): FaceLensTrack | null => {
    const rec = recRef.current;
    recRef.current = null;
    if (!rec || rec.samples.length === 0) { return null; }
    const durMs = rec.samples[rec.samples.length - 1].t;
    const n = Math.max(1, Math.ceil((durMs / 1000) * TRACK_FPS));
    const frames: (FaceLandmarks | null)[] = new Array(n).fill(null);
    let si = 0;
    for (let i = 0; i < n; i++) {
      const tMs = (i / TRACK_FPS) * 1000;
      while (si + 1 < rec.samples.length && rec.samples[si + 1].t <= tMs) { si++; }
      let s = rec.samples[si];
      const next = rec.samples[si + 1];
      if (next && Math.abs(next.t - tMs) < Math.abs(s.t - tMs)) { s = next; }
      const lm = s.lm;
      frames[i] = lm && {
        leftEye: { x: r3(lm.leftEye.x), y: r3(lm.leftEye.y) },
        rightEye: { x: r3(lm.rightEye.x), y: r3(lm.rightEye.y) },
        noseTip: { x: r3(lm.noseTip.x), y: r3(lm.noseTip.y) },
        mouthCenter: { x: r3(lm.mouthCenter.x), y: r3(lm.mouthCenter.y) },
        faceWidth: r3(lm.faceWidth),
        roll: r3(lm.roll),
      };
    }
    return { lensId: rec.lensId, fps: TRACK_FPS, frames, frameAspect: rec.frameAspect };
  }, []);

  return { frameProcessor, landmarks, status, frameAspect, startTrack, stopTrack, cancelTrack };
}
