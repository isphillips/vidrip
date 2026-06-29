import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera';
import { Worklets, useSharedValue as useWorkletSharedValue } from 'react-native-worklets-core';
import type { FaceLandmarks, FaceLensTrack } from './faceLens';
import type { Pt } from './core/types';
import { MESH_TRACK_INDICES, MESH_VERTS, quantizeMesh } from './core/meshContours';

// Every mesh vertex (0..477). Used by the studio capture-bake, which renders the lens into the video
// PIXELS immediately and is never persisted — so it can afford the full mesh and bake every node (dense
// lenses like Star Map draw a dot per vertex). Reaction tracks ARE persisted to the DB, so they keep the
// compact contour subset (MESH_TRACK_INDICES) instead.
const ALL_MESH_INDICES: number[] = Array.from({ length: MESH_VERTS }, (_, i) => i);

// The two platforms feed MediaPipe differently, so the keypoints arrive in different conventions:
//  • iOS pins frame.orientation → coords are pre-rotated (rotated 90° + upside-down + mirrored vs the
//    preview) → needs the base map + eye-midpoint reflection + lift below.
//  • Android passes the RAW sensor image (no rotation) → coords are already ~upright (p0 = vertical
//    down, p1 = horizontal eye axis) → only the selfie mirror is needed; the reflection would flip it.
const IS_ANDROID = Platform.OS === 'android';

// Android only: constant normalized nudges to re-center the constellation after orientation mapping.
// DX: NEGATIVE = screen-LEFT. DY: NEGATIVE = screen-UP (markers sit low → lift them up).
// The lift is TRACK-AWARE: BlazeFace's 6 keypoints sit a touch low and need lifting, but the mesh's
// eye anchors are geometric eye-centres (mid of the eye-corner contour points) that already land on
// the eyes — lifting them too pushes the mesh ABOVE the eyeline. Tune per-device from raw keypoints.
const ANDROID_DX = 0;
const ANDROID_DY_BLAZE = -0.05;
const ANDROID_DY_MESH = 0;

// Replay sampling rate for the captured track
const TRACK_FPS = 30;
// Cap live inference. The camera runs at 60fps
const LIVE_FPS = 30;
const r3 = (n: number) => Math.round(n * 1000) / 1000; // trim serialized track size

// Orientation fed to MediaPipe on iOS. Calibrated: feeding 'up' makes the FaceLandmarker output a
// clean upright face (p0 = vertical, p1 = eye axis), so reduce()'s iOS map is a plain axis swap. (The
// pinned frame.orientation default produced a 180°-rotated output that needed a reflection hack.)
const IOS_MESH_ORI = 'up';

type TrackSample = { t: number; lm: FaceLandmarks | null };
// `tsBase` = the first frame's capture timestamp (host-clock ms); samples are stored relative to it so
// the track shares the recorded video's timeline (capture time), not the JS detection-arrival time.
type TrackRec = { t0: number; tsBase?: number; lensId: string; frameAspect?: number; samples: TrackSample[] };

const SNAP = 0.22;       // a jump bigger than this snaps instead of easing (re-acquire / fast move)
// SMOOTH (EMA factor) and DEADBAND are track-aware — the mesh is far less jittery than BlazeFace, so
// it eases far less (snappier, less lag). Declared just below, after faceTrackKind is known.
// Hide debounce: when detection drops, hold the last pose and only hide once the face has been gone
// this long. Rides blinks / brief turns / single missed frames without strobing.
const HIDE_MS = 2000;

// Speed-adaptive mesh smoothing: lerp each vertex toward the new detection by `a` (the SAME factor the
// anchors use — ~1 during real motion so tracking stays instant, lower when slow/idle). This damps the
// per-vertex jitter and, importantly, the unstable fits MediaPipe returns at extreme pitch (looking up),
// which otherwise read as the mesh "flipping". Vertices absent from either frame pass through.
function meshLerp(prev: (Pt | undefined)[] | undefined, cur: (Pt | undefined)[] | undefined, a: number): (Pt | undefined)[] | undefined {
  if (!cur || !prev || a >= 1) { return cur; }
  const out: (Pt | undefined)[] = new Array(cur.length);
  for (let i = 0; i < cur.length; i++) {
    const c = cur[i], p = prev[i];
    out[i] = c && p ? { x: p.x + (c.x - p.x) * a, y: p.y + (c.y - p.y) * a } : c;
  }
  return out;
}

function ema(prev: FaceLandmarks, cur: FaceLandmarks, a: number, aMesh: number): FaceLandmarks {
  const mix = (p: number, c: number) => p + (c - p) * a;
  const mixPt = (p: { x: number; y: number }, c: { x: number; y: number }) => ({ x: mix(p.x, c.x), y: mix(p.y, c.y) });
  return {
    leftEye: mixPt(prev.leftEye, cur.leftEye),
    rightEye: mixPt(prev.rightEye, cur.rightEye),
    noseTip: mixPt(prev.noseTip, cur.noseTip),
    mouthCenter: mixPt(prev.mouthCenter, cur.mouthCenter),
    faceWidth: mix(prev.faceWidth, cur.faceWidth),
    roll: mix(prev.roll, cur.roll),
    mesh: meshLerp(prev.mesh, cur.mesh, aMesh), // speed-adaptive: instant when moving, damped when slow
  };
}

// ── One-Euro filter (Tier 0) ───────────────────────────────────────────────────────────────────────
// A principled low-pass whose cutoff ADAPTS to signal speed: heavy smoothing when the face is still
// (kills the idle landmark jitter that reads as "cheap" vs Snapchat), and almost none when moving fast
// (so there's no lag). Replaces the hand-tuned speed-adaptive EMA above when USE_ONE_EURO is on.
// State is a flat bank (typed arrays) so the 478-vertex mesh is just 956 scalars — cheap, zero per-frame
// allocation. Works on NORMALISED coords with a real dt (seconds), so it's frame-rate independent.
const oeAlpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

class OneEuroBank {
  private xHat: Float64Array;
  private dxHat: Float64Array;
  private ready: Uint8Array;
  constructor(n: number, private minCutoff: number, private beta: number, private dCutoff = 1) {
    this.xHat = new Float64Array(n);
    this.dxHat = new Float64Array(n);
    this.ready = new Uint8Array(n);
  }
  resetAll() { this.ready.fill(0); }
  resetIndex(i: number) { this.ready[i] = 0; }
  // Filter scalar `i` toward `v` over elapsed `dt` (s), then dead-reckon `lead` seconds forward using the
  // filtered velocity to cancel pipeline latency. dt<=0 (or the first sample) seeds & returns raw. The
  // STATE (xHat) stays the un-predicted smoothed value — prediction is output-only, never fed back.
  step(i: number, v: number, dt: number, lead: number): number {
    if (!this.ready[i] || dt <= 0) { this.ready[i] = 1; this.xHat[i] = v; this.dxHat[i] = 0; return v; }
    const aD = oeAlpha(this.dCutoff, dt);
    const dv = (v - this.xHat[i]) / dt;
    const edx = aD * dv + (1 - aD) * this.dxHat[i];
    this.dxHat[i] = edx;
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const a = oeAlpha(cutoff, dt);
    const x = a * v + (1 - a) * this.xHat[i];
    this.xHat[i] = x;
    return x + edx * lead;   // edx≈0 at rest → no overshoot; = velocity in motion → pulls forward to "now"
  }
}

// Zero-phase smoother for the RECORDED track (run at stopTrack, where the whole series is known). Runs
// the One-Euro filter forward AND backward over a scalar series and averages → the same adaptive jitter
// rejection as the live preview, but with NO net lag, so each frame still lands on its recorded video
// frame. No prediction (lead=0): the bake composites onto real frames, so there's no display latency to
// cancel. Resets across null gaps (frames with no detection). Off the hot path — runs once per clip.
function smoothTrackSeries(n: number, minCutoff: number, beta: number, get: (i: number) => number | null, set: (i: number, v: number) => void): void {
  const dt = 1 / TRACK_FPS;
  const fwdBank = new OneEuroBank(1, minCutoff, beta);
  const fwd: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = get(i);
    if (v == null) { fwdBank.resetIndex(0); fwd[i] = null; } else { fwd[i] = fwdBank.step(0, v, dt, 0); }
  }
  const bwdBank = new OneEuroBank(1, minCutoff, beta);
  for (let i = n - 1; i >= 0; i--) {
    const v = get(i);
    if (v == null) { bwdBank.resetIndex(0); continue; }
    const b = bwdBank.step(0, v, dt, 0);
    const f = fwd[i];
    if (f != null) { set(i, (f + b) / 2); }
  }
}

// SPIKE FLAG. true → use the 478-pt Face Landmarker ('faceMesh' plugin: richer, jitter-resistant
// anchors, heavier inference). false → the lightweight BlazeFace 6-keypoint detector ('faceLandmarks').
// Both return the same { points: [[x,y]×6] } anchor contract, so the reduce()/orientation path below is
// shared; the mesh additionally returns the full { mesh: [[x,y]×478] } on request. Flip to A/B on-device.
// Falls back to BlazeFace automatically if the mesh plugin/model is missing from the build.
const USE_FACE_MESH = true;

// Two native plugins. Each returns { points: number[][] } ([[x,y]×6], 0..1 in the raw buffer space);
// the mesh one also returns { mesh: number[][] } when asked (mesh lenses).
let blazePlugin: ReturnType<typeof VisionCameraProxy.initFrameProcessorPlugin> | undefined;
let meshPlugin: ReturnType<typeof VisionCameraProxy.initFrameProcessorPlugin> | undefined;
try { blazePlugin = VisionCameraProxy.initFrameProcessorPlugin('faceLandmarks', {}); } catch { blazePlugin = undefined; }
try { meshPlugin = VisionCameraProxy.initFrameProcessorPlugin('faceMesh', {}); } catch { meshPlugin = undefined; }
// Prefer the mesh when requested AND built; otherwise BlazeFace.
const useMesh = USE_FACE_MESH && !!meshPlugin;
const plugin = useMesh ? meshPlugin : blazePlugin;

/** Whether a native MediaPipe plugin is present in this build (gate Camera frameProcessor on it). */
export const faceTrackingAvailable = !!plugin;
/** Which face track is live ('mesh' = Face Landmarker, 'blaze' = BlazeFace). Exposed for diagnostics. */
export const faceTrackKind: 'mesh' | 'blaze' = useMesh ? 'mesh' : 'blaze';

// Easing factor toward each detection. Mesh = 1.0 → fully instant/1:1 (max snappy; accepts a little
// idle jitter, which is the chosen tradeoff). BlazeFace keeps a low idle floor + speed ramp (1€-filter
// style) because it's far noisier and unusable raw. To re-introduce mesh smoothing, lower SMOOTH_IDLE
// (e.g. 0.18) — the factor then ramps from that floor (idle) up to 1 as motion reaches MOVE_FULL.
// DEADBAND is the motion below which we don't update at all (freezes the smallest micro-jitter; it
// never adds lag to perceptible motion).
const SMOOTH_IDLE = faceTrackKind === 'mesh' ? 1.0 : 0.25;
const MOVE_FULL = faceTrackKind === 'mesh' ? 0.022 : 0.03;
const DEADBAND = faceTrackKind === 'mesh' ? 0.004 : 0.008;
// The 478-pt mesh gets its OWN (lower) idle floor than the anchors: anchors stay maximally snappy
// (SMOOTH_IDLE = 1), but the mesh is damped when slow/idle to kill per-vertex jitter and the unstable
// fits at extreme pitch (the "flip"). Ramps to 1 (instant) at MOVE_FULL too, so real motion isn't slowed.
const MESH_IDLE = 0.6;

// One-Euro tuning (Tier 0). Flip USE_ONE_EURO to A/B against the legacy EMA on-device; the live DEV
// status shows '1€' + 'j<n>' (mean smoothed motion ×1000 over 1s — hold still and watch it drop vs the
// EMA path). These are normalised-coord starting points; tune on a real device: lower *_MIN_CUTOFF =
// steadier at rest (slightly more lag); raise *_BETA = snappier under motion. The mesh gets stronger
// smoothing than the anchors because its per-vertex jitter (and the extreme-pitch "flip") is the worst.
const USE_ONE_EURO = true;
const ANCHOR_MIN_CUTOFF = faceTrackKind === 'mesh' ? 1.5 : 1.0;
const ANCHOR_BETA       = faceTrackKind === 'mesh' ? 30 : 20;
const MESH_MIN_CUTOFF   = 1.0;
const MESH_BETA         = 25;

// Predictive lead (seconds): dead-reckon landmarks forward by their One-Euro velocity to CANCEL the
// irreducible pipeline latency (the displayed mesh is always ~1 frame + inference old). 0 = off. Higher
// = less trail but more overshoot on fast reversals/stops. Start below the true latency (~30–45ms) since
// partial cancellation is safe; the MESH leads a touch less than the anchors so per-vertex velocity noise
// doesn't make the wireframe "breathe". Dial up until a hard stop just barely overshoots, then back off.
const ANCHOR_PREDICT_S = 40 / 1000;
const MESH_PREDICT_S   = 28 / 1000;

// Apply the same (zero-phase, no-prediction) One-Euro smoothing to the RECORDED track at stopTrack, so
// exported/replayed clips are as jitter-free as the live preview. Off → the track keeps raw detections.
const SMOOTH_TRACK = true;

// One filter instance per tracking session. Anchors and mesh are separate banks (different cutoffs);
// roll is filtered too (currently 0 from reduce(), so a no-op until 3D pose lands in Tier 1).
function makeLandmarkFilter() {
  const anchors = new OneEuroBank(10, ANCHOR_MIN_CUTOFF, ANCHOR_BETA); // 4 pts ×2 + faceWidth + roll
  const mesh = new OneEuroBank(MESH_VERTS * 2, MESH_MIN_CUTOFF, MESH_BETA);
  return {
    reset() { anchors.resetAll(); mesh.resetAll(); },
    // Smooth a full detection. dt<=0 seeds (used on snap/re-acquire so it locks on with no catch-up slide).
    filter(lm: FaceLandmarks, dt: number): FaceLandmarks {
      const a = (i: number, v: number) => anchors.step(i, v, dt, ANCHOR_PREDICT_S);
      let outMesh: (Pt | undefined)[] | undefined;
      if (lm.mesh) {
        const m = lm.mesh;
        outMesh = new Array(m.length);
        for (let i = 0; i < m.length; i++) {
          const p = m[i];
          if (p && i < MESH_VERTS) {
            outMesh[i] = { x: mesh.step(2 * i, p.x, dt, MESH_PREDICT_S), y: mesh.step(2 * i + 1, p.y, dt, MESH_PREDICT_S) };
          } else {
            if (i < MESH_VERTS) { mesh.resetIndex(2 * i); mesh.resetIndex(2 * i + 1); }
            outMesh[i] = p;
          }
        }
      }
      return {
        leftEye: { x: a(0, lm.leftEye.x), y: a(1, lm.leftEye.y) },
        rightEye: { x: a(2, lm.rightEye.x), y: a(3, lm.rightEye.y) },
        noseTip: { x: a(4, lm.noseTip.x), y: a(5, lm.noseTip.y) },
        mouthCenter: { x: a(6, lm.mouthCenter.x), y: a(7, lm.mouthCenter.y) },
        faceWidth: a(8, lm.faceWidth),
        roll: a(9, lm.roll),
        mesh: outMesh,
      };
    },
  };
}

// BlazeFace keypoint indices (right/left as seen in the image).
const RIGHT_EYE = 0;
const LEFT_EYE = 1;
const NOSE_TIP = 2;
const MOUTH = 3;
const EAR_R = 4;
const EAR_L = 5;

// Map the keypoints into preview-space anchors. roll stays 0 here — faceFrame() derives tilt from the
// eyeMid→mouth line, so getting the anchor positions right is all that's needed.
//
// iOS CALIBRATION (see face-lens-orientation-calibration). The native plugin is fed orientation 'up'
// (IOS_MESH_ORI), which makes MediaPipe output a clean upright face: p0 = vertical (forehead small →
// chin large), p1 = horizontal eye axis. So the map is an axis swap + selfie mirror — x = 1 - p1,
// y = p0 — with NO reflection/lift/roll-fix. Earlier hacks (eye-line reflection, centroid reflection)
// were fighting a 180°-rotated output from the pinned-frame.orientation default; feeding 'up' fixes it
// at the source so position, structure, AND pitch are all correct from one trivial map.
// `meshRaw` may arrive in EITHER wire format and we auto-detect per call (meshRaw[0] is a number → the
// new FLAT [x0,y0,x1,y1,…] build; an array → the OLD nested [[x,y]×478] build). So this JS runs against
// whichever native build is installed — no flag to keep in sync across a native rebuild.
function reduce(points: number[][] | null | undefined, _aspect: number, orientation: string, _mirrored: boolean, _isMesh: boolean, meshRaw?: number[] | number[][]): FaceLandmarks | null {
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
    const dy = _isMesh ? ANDROID_DY_MESH : ANDROID_DY_BLAZE;
    const am = (p: number[]) => {
      const p0 = p[0], p1 = p[1];
      const x = ll ? 1 - p1 : p1;
      const y = ll ? 1 - p0 : p0;
      return { x: x + ANDROID_DX, y: y + dy };
    };
    const le = am(points[LEFT_EYE]), re = am(points[RIGHT_EYE]), nose = am(points[NOSE_TIP]), mouth = am(points[MOUTH]);
    const er = am(points[EAR_R]), el = am(points[EAR_L]);
    // Decode the mesh (flat or nested — auto-detected) with the SAME per-vertex map as the anchors.
    let mesh: Pt[] | undefined;
    if (meshRaw) {
      const flat = typeof meshRaw[0] === 'number';
      const fr = meshRaw as number[]; const nr = meshRaw as number[][];
      const n = flat ? fr.length >> 1 : nr.length;
      mesh = new Array(n);
      for (let i = 0; i < n; i++) {
        const p0 = flat ? fr[2 * i] : nr[i][0];
        const p1 = flat ? fr[2 * i + 1] : nr[i][1];
        mesh[i] = { x: (ll ? 1 - p1 : p1) + ANDROID_DX, y: (ll ? 1 - p0 : p0) + dy };
      }
    }
    return {
      leftEye: le, rightEye: re, noseTip: nose, mouthCenter: mouth,
      faceWidth: Math.hypot(el.x - er.x, el.y - er.y), roll: 0,
      mesh,
    };
  }

  // Image→preview map. With the orientation pinned to 'up' (fed to MediaPipe natively), the output is
  // a clean upright face: p0 = vertical (forehead small → chin large), p1 = horizontal eye axis. So
  // the map is an axis swap plus the selfie mirror — x = 1 - p1, y = p0 — no reflection/lift/roll-fix.
  // Applied identically to anchors AND mesh so they stay aligned.
  const map = (p: number[]) => ({ x: 1 - p[1], y: p[0] });
  const le = map(points[LEFT_EYE]), re = map(points[RIGHT_EYE]);
  const nose = map(points[NOSE_TIP]), mouth = map(points[MOUTH]);
  const earR = map(points[EAR_R]), earL = map(points[EAR_L]);
  // Decode the mesh (flat or nested — auto-detected) with the SAME axis-swap+mirror map as the anchors.
  let mesh: Pt[] | undefined;
  if (meshRaw) {
    const flat = typeof meshRaw[0] === 'number';
    const fr = meshRaw as number[]; const nr = meshRaw as number[][];
    const n = flat ? fr.length >> 1 : nr.length;
    mesh = new Array(n);
    for (let i = 0; i < n; i++) {
      const p0 = flat ? fr[2 * i] : nr[i][0];
      const p1 = flat ? fr[2 * i + 1] : nr[i][1];
      mesh[i] = { x: 1 - p1, y: p0 };
    }
  }
  return {
    leftEye: le,
    rightEye: re,
    noseTip: nose,
    mouthCenter: mouth,
    faceWidth: Math.hypot(earL.x - earR.x, earL.y - earR.y),
    roll: 0,
    mesh,
  };
}

// Returns a frame processor (attach to <Camera frameProcessor={...}>) and the latest reduced
// landmarks. `mirror` true for the front camera. Returns landmarks=null (and a no-op processor) if
// the plugin isn't built yet.
export function useFaceTracking(mirror = true, withMesh = false) {
  // Per-frame landmarks are delivered by a DIRECT subscription, not React state. setState here would
  // re-render the host screen (camera + source players + lens picker) 30×/sec — the dominant source of
  // lens lag/jitter. Instead the tracker pushes each frame straight to the subscribed <LiveFaceLens>
  // overlay, which holds the per-frame state in isolation, so the heavy screen never re-renders.
  const subRef = useRef<((lm: FaceLandmarks | null) => void) | null>(null);
  const subscribe = useCallback((fn: (lm: FaceLandmarks | null) => void) => {
    subRef.current = fn;
    return () => { if (subRef.current === fn) { subRef.current = null; } };
  }, []);
  const [status, setStatus] = useState<string>('init'); // diagnostic: ok | null | <err>
  // The aspect (w/h, <1 for portrait) of the actual frame the keypoints are normalized to — measured
  // from the live frame, not guessed from `format` (which can differ from the delivered buffer and
  // makes the overlay's cover-crop mapping splay markers off-face toward the edges). 0 until known.
  const [frameAspect, setFrameAspect] = useState(0);
  const frameAspectRef = useRef(0);
  const statusRef = useRef('init');                 // avoid re-rendering on unchanged status
  const smoothRef = useRef<FaceLandmarks | null>(null); // running EMA-smoothed pose (LIVE overlay)
  const lastRawRef = useRef<FaceLandmarks | null>(null); // last RAW detection (recorded to the track — snappy)
  const lastGoodRef = useRef(0);                    // last frame a face was detected (hide debounce)
  const hiddenRef = useRef(true);                   // whether markers are currently hidden
  const recRef = useRef<TrackRec | null>(null);     // active capture (during recording)
  // DEV diagnostic: effective tracking rate = successful detections delivered to JS per second (after the
  // back-pressure gate). A low number here means inference/pipeline can't keep up (e.g. Android CPU
  // delegate or a slow device) — that IS the lag. ~30 = healthy; single digits = the bottleneck.
  const fpsCountRef = useRef(0);
  const fpsWinRef = useRef(0);
  const detFpsRef = useRef(0);
  // One-Euro smoothing state (Tier 0) + a tiny jitter HUD: mean motion of the SMOOTHED output over the
  // 1s window (×1000). Hold the face still and compare the legacy EMA vs One-Euro — lower = less jitter.
  const filterRef = useRef<ReturnType<typeof makeLandmarkFilter>>();
  if (!filterRef.current) { filterRef.current = makeLandmarkFilter(); }
  const lastTsRef = useRef(0);            // ms timestamp of the previous accepted detection (for dt)
  const jitterAccRef = useRef(0);
  const jitterCntRef = useRef(0);
  const jitterRef = useRef(0);
  // Diagnostic: mean NATIVE inference time (ms) — the plugin.call duration measured in the worklet. This
  // is the decisive "is it the processor?" number: if inf≈cycle (1000/fps) the model is the wall; if inf
  // is small but fps is still low, the cost is the worklet→JS round-trip, not MediaPipe.
  const infAccRef = useRef(0);
  const infCntRef = useRef(0);
  const infRef = useRef(0);
  // Diagnostic: RAW camera frame-delivery rate, counted in the worklet BEFORE any throttle/back-pressure.
  // If cam≈det the bottleneck is the SENSOR (low-light fps drop / format) — not our pipeline. If cam≫det,
  // it's the runAtTargetFps throttle or the JS round-trip dropping frames.
  const camFpsRef = useRef(0);
  const lastRawSnapRef = useRef(0);
  // Back-pressure. Caps how many frames are mid-flight (detected, handed to JS, not yet consumed) so a
  // slow JS thread can't build a runOnJS backlog that "slides". Inference is ~10ms but a full detect→JS
  // round-trip is ~50ms, so gating to ONE in-flight serialised them and threw away frames waiting on the
  // round-trip (capping ~20fps). Allowing TWO lets the next detect PIPELINE over the previous handoff —
  // the bound stays tiny (≤2 frames of lag, dropped not queued), but the worklet no longer idles. */
  const MAX_INFLIGHT = 2;
  const inFlight = useWorkletSharedValue(0);
  // setAspect is constant after the first frame, but was firing a full runOnJS hop EVERY frame (a second
  // crossing on top of pushJs). Gate it to fire only when the aspect actually changes (≈once).
  const lastAspectSent = useWorkletSharedValue(0);
  const rawSV = useWorkletSharedValue(0);   // ++ every camera frame (pre-throttle) → true sensor fps

  const push = useCallback((lm: FaceLandmarks | null, st: string, ts: number, infMs = 0) => {
   try {
    const now = Date.now();
    // Roll a 1s window of successful detections → effective tracking fps (folded into the DEV status).
    if (lm) { fpsCountRef.current++; }
    if (infMs > 0) { infAccRef.current += infMs; infCntRef.current++; }
    if (now - fpsWinRef.current >= 1000) {
      detFpsRef.current = fpsCountRef.current; fpsCountRef.current = 0; fpsWinRef.current = now;
      jitterRef.current = jitterCntRef.current ? jitterAccRef.current / jitterCntRef.current : 0;
      jitterAccRef.current = 0; jitterCntRef.current = 0;
      infRef.current = infCntRef.current ? Math.round(infAccRef.current / infCntRef.current) : 0;
      infAccRef.current = 0; infCntRef.current = 0;
      const raw = rawSV.value; camFpsRef.current = raw - lastRawSnapRef.current; lastRawSnapRef.current = raw;
    }
    const dispSt = st === 'ok'
      ? `ok ${detFpsRef.current}fps cam${camFpsRef.current} inf${infRef.current}${USE_ONE_EURO ? ' 1€' : ''} j${Math.round(jitterRef.current * 1000)}`
      : st;
    if (dispSt !== statusRef.current) { statusRef.current = dispSt; setStatus(dispSt); }
    if (lm) {
      lastGoodRef.current = now;
      hiddenRef.current = false;
      lastRawRef.current = lm;   // remember the raw detection for the track (no easing → snappy bake)
      const prev = smoothRef.current;
      // Motion = the largest displacement of any anchor (not just the nose — a head TILT pivots near
      // the nose, so the eyes carry the movement). Below the deadband we hold the pose.
      const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
      const moved = prev
        ? Math.max(d(lm.noseTip, prev.noseTip), d(lm.leftEye, prev.leftEye), d(lm.rightEye, prev.rightEye), d(lm.mouthCenter, prev.mouthCenter))
        : 1;
      // Smooth the detection toward the displayed pose. Snap on first acquire or a big jump (≥SNAP) so
      // markers don't crawl/slide on re-acquire or fast moves.
      let out: FaceLandmarks | null = null;
      if (USE_ONE_EURO) {
        const filter = filterRef.current!;
        if (!prev || moved >= SNAP) {
          // Re-acquire / big jump → reset & seed the filter (dt=0) so it locks onto the new pose instantly.
          filter.reset();
          out = filter.filter(lm, 0);
          lastTsRef.current = now;
        } else {
          // Real elapsed time between detections → frame-rate-independent cutoff. Clamp out absurd gaps.
          let dt = (now - lastTsRef.current) / 1000;
          lastTsRef.current = now;
          if (!(dt > 0)) { dt = 1 / LIVE_FPS; }
          dt = Math.min(0.1, Math.max(1 / 120, dt));
          out = filter.filter(lm, dt);
        }
      } else {
        // Legacy speed-adaptive EMA (kept for A/B). Below the deadband we hold the displayed pose; above
        // it we ease: idle → SMOOTH_IDLE (heavy, kills jitter), real motion (≥MOVE_FULL) → 1 (instant).
        if (!prev || moved >= DEADBAND) {
          const t = Math.min(1, Math.max(0, (moved - DEADBAND) / (MOVE_FULL - DEADBAND)));
          const a = SMOOTH_IDLE + (1 - SMOOTH_IDLE) * t;
          const aMesh = MESH_IDLE + (1 - MESH_IDLE) * t;
          out = prev && moved < SNAP ? ema(prev, lm, a, aMesh) : lm;
        }
      }
      if (out) {
        // Jitter HUD: residual motion of the SMOOTHED output (hold still → reads the leftover jitter).
        if (prev) { jitterAccRef.current += Math.max(d(out.noseTip, prev.noseTip), d(out.leftEye, prev.leftEye), d(out.rightEye, prev.rightEye), d(out.mouthCenter, prev.mouthCenter)); jitterCntRef.current++; }
        smoothRef.current = out;
        subRef.current?.(out);
      }
    } else if (!hiddenRef.current && now - lastGoodRef.current > HIDE_MS) {
      hiddenRef.current = true;
      smoothRef.current = null;
      filterRef.current?.reset();   // next acquisition snaps fresh instead of easing from a stale pose
      subRef.current?.(null);
    }
    // Record the RAW detection (not the eased/smoothed pose) so the bake — which sits on the ground-truth
    // recorded frames — has no easing lag; the last raw pose is HELD during brief detection gaps (matches
    // live's hide-debounce so it doesn't flicker) and goes null once truly hidden. Key it to the frame's
    // CAPTURE time (host-clock ms — iOS gives ms, Android ns), NOT now()/arrival time, so the mesh lands
    // on the exact recorded frame it came from (no inference-latency trail). Live still renders smoothed.
    const rec = recRef.current;
    if (rec) {
      const tsMs = IS_ANDROID ? ts / 1e6 : ts;
      if (rec.tsBase == null) { rec.tsBase = tsMs; }
      rec.samples.push({ t: tsMs - rec.tsBase, lm: hiddenRef.current ? null : (lm ?? lastRawRef.current) });
    }
   } finally {
     // Free one in-flight slot once this frame is fully handled (incl. the subscriber). The worklet may
     // already have detected the next one in parallel (up to MAX_INFLIGHT), so detection never idles.
     inFlight.value = Math.max(0, inFlight.value - 1);
   }
  }, [inFlight]);
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

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!plugin) { return; }
    rawSV.value = rawSV.value + 1;   // every delivered camera frame
    // NO runAtTargetFps gate. It only runs the body once >1/target has elapsed, so against a ~30fps
    // sensor, timing jitter dropped ~⅓ of frames (det stuck ~20 while cam=30). `inFlight` is the real
    // back-pressure now, so attempt the detect on EVERY camera frame — bounded to MAX_INFLIGHT in-flight
    // (dropped, not queued → no backlog "slide"). Self-regulates on 60fps cameras / heavy lenses too.
    {
      // Skip only if MAX_INFLIGHT frames are already mid-flight (detected, not yet consumed by JS).
      if (inFlight.value >= MAX_INFLIGHT) { return; }
      // min/max is rotation-invariant, so this is the displayed portrait aspect regardless of sensor
      // orientation — the true space the keypoints live in.
      const aspect = Math.min(frame.width, frame.height) / Math.max(frame.width, frame.height);
      // Constant after frame 1 — only cross to JS when it actually changes (was a wasted hop every frame).
      if (Math.abs(aspect - lastAspectSent.value) > 0.001) { lastAspectSent.value = aspect; setAspectJs(aspect); }
      const ori = String(frame.orientation);
      // Only ask the native side for the full 478-pt mesh when a mesh-rendering lens needs it — keeps
      // the bridge to 6 anchors otherwise. `ori` pins the orientation fed to MediaPipe (see reduce()).
      const wantMesh = withMesh && useMesh;
      // VisionCamera throws "expected an Object" if the 2nd arg is explicitly undefined — always pass a
      // real object.
      // Time the native detect (plugin.call) to isolate inference cost from the JS round-trip. Guarded:
      // if the worklet runtime has no `performance.now`, infMs stays 0 (HUD shows inf0 → go native).
      const perf: any = (globalThis as any).performance;
      const t0 = perf && perf.now ? perf.now() : 0;
      const res = (wantMesh ? plugin!.call(frame, { mesh: true, ori: IOS_MESH_ORI }) : plugin!.call(frame, { ori: IOS_MESH_ORI })) as unknown as
        { points?: number[][]; mesh?: number[] | number[][]; err?: string } | null;
      const infMs = t0 ? Math.round(perf.now() - t0) : 0;
      // Claim the in-flight slot right before handing off; push() releases it when fully done. The
      // frame's capture timestamp is threaded through so the track is keyed to capture time, not arrival.
      const ts = frame.timestamp;
      if (res && res.points) {
        const lm = reduce(res.points, aspect, ori, false, useMesh, res.mesh);
        inFlight.value = inFlight.value + 1;
        pushJs(lm, 'ok', ts, infMs);
      } else { inFlight.value = inFlight.value + 1; pushJs(null, (res && res.err) || 'null', ts, infMs); }
    }
  }, [pushJs, setAspectJs, mirror, withMesh, inFlight, lastAspectSent, rawSV]);

  // ── Track capture ──────────────────────────────────────────────────────────
  // Start when recording begins; stop returns a time-sampled FaceLensTrack to persist with the clip;
  // cancel discards. The selfie video is the timing master on replay, so samples are keyed to
  // recording-start and resampled to a fixed fps grid.
  const startTrack = useCallback((lensId: string, frameAspect?: number) => {
    lastRawRef.current = null;   // fresh capture → don't hold a stale pose from a previous take
    recRef.current = { t0: Date.now(), lensId, frameAspect, samples: [] };
  }, []);
  const cancelTrack = useCallback(() => { recRef.current = null; }, []);
  const stopTrack = useCallback((opts?: { fullMesh?: boolean }): FaceLensTrack | null => {
    const rec = recRef.current;
    recRef.current = null;
    if (!rec || rec.samples.length === 0) { return null; }
    // Studio (baked into pixels, transient) keeps every vertex so dense lenses bake all their nodes;
    // reactions (persisted) keep the compact contour subset.
    const meshIndices = opts?.fullMesh ? ALL_MESH_INDICES : MESH_TRACK_INDICES;
    const durMs = rec.samples[rec.samples.length - 1].t;
    const n = Math.max(1, Math.ceil((durMs / 1000) * TRACK_FPS));
    const frames: (FaceLandmarks | null)[] = new Array(n).fill(null);
    const meshFrames: (number[] | null)[] = new Array(n).fill(null);
    let hasMesh = false;
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
      // Mesh lenses: persist the picked mesh subset (full for studio bakes, contour-subset otherwise).
      if (lm?.mesh) { meshFrames[i] = quantizeMesh(lm.mesh, meshIndices); hasMesh = true; }
    }

    // Zero-phase smoothing pass: same One-Euro jitter rejection as the live preview, applied forward+
    // backward over the resampled grid so there's NO net lag (frames stay aligned to the recorded video).
    if (SMOOTH_TRACK && USE_ONE_EURO) {
      // Anchors (roll stays 0, so it's left untouched). Mutates the per-frame objects in place; r3 keeps
      // the serialized track small.
      const anchorSpecs: Array<[(l: FaceLandmarks) => number, (l: FaceLandmarks, v: number) => void]> = [
        [l => l.leftEye.x,     (l, v) => { l.leftEye.x = v; }],
        [l => l.leftEye.y,     (l, v) => { l.leftEye.y = v; }],
        [l => l.rightEye.x,    (l, v) => { l.rightEye.x = v; }],
        [l => l.rightEye.y,    (l, v) => { l.rightEye.y = v; }],
        [l => l.noseTip.x,     (l, v) => { l.noseTip.x = v; }],
        [l => l.noseTip.y,     (l, v) => { l.noseTip.y = v; }],
        [l => l.mouthCenter.x, (l, v) => { l.mouthCenter.x = v; }],
        [l => l.mouthCenter.y, (l, v) => { l.mouthCenter.y = v; }],
        [l => l.faceWidth,     (l, v) => { l.faceWidth = v; }],
      ];
      for (const [read, write] of anchorSpecs) {
        smoothTrackSeries(n, ANCHOR_MIN_CUTOFF, ANCHOR_BETA,
          (i) => { const l = frames[i]; return l ? read(l) : null; },
          (i, v) => { const l = frames[i]; if (l) { write(l, r3(v)); } });
      }
      // Mesh subset: meshFrames[i] is a flat [x0,y0,…] of ×1000 ints — smooth each scalar across time.
      if (hasMesh) {
        const mlen = meshIndices.length * 2;
        for (let j = 0; j < mlen; j++) {
          smoothTrackSeries(n, MESH_MIN_CUTOFF, MESH_BETA,
            (i) => { const m = meshFrames[i]; return m ? m[j] : null; },
            (i, v) => { const m = meshFrames[i]; if (m) { m[j] = Math.round(v); } });
        }
      }
    }

    const track: FaceLensTrack = { lensId: rec.lensId, fps: TRACK_FPS, frames, frameAspect: rec.frameAspect };
    if (hasMesh) { track.meshIdx = meshIndices; track.meshFrames = meshFrames; }
    return track;
  }, []);

  return { frameProcessor, subscribe, status, frameAspect, startTrack, stopTrack, cancelTrack };
}
