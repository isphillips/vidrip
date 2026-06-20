import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useFrameProcessor, runAtTargetFps, VisionCameraProxy } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import type { FaceLandmarks, FaceLensTrack } from './faceLens';
import type { FaceBlendshapes } from './core/types';
import { MESH_TRACK_INDICES, quantizeMesh } from './core/meshContours';

// The two platforms feed MediaPipe differently, so the keypoints arrive in different conventions:
//  • iOS pins frame.orientation → coords are pre-rotated (rotated 90° + upside-down + mirrored vs the
//    preview) → needs the base map + eye-midpoint reflection + lift below.
//  • Android passes the RAW sensor image (no rotation) → coords are already ~upright (p0 = vertical
//    down, p1 = horizontal eye axis) → only the selfie mirror is needed; the reflection would flip it.
const IS_ANDROID = Platform.OS === 'android';

// Android only: constant normalized nudges to re-center the constellation after orientation mapping.
// DX: NEGATIVE = screen-LEFT. DY: NEGATIVE = screen-UP (markers sit low → lift them up).
const ANDROID_DX = 0;
const ANDROID_DY = -0.05;

// Replay sampling rate for the captured track — 15fps is plenty for an overlay and keeps the
// persisted track small.
const TRACK_FPS = 15;
// Anchor-only lenses use the lightweight BlazeFace detector (~5-10ms) — run them at the full camera
// rate for real-time tracking.
const ANCHOR_LIVE_FPS = 30;
// Mesh lenses pull the full 478-pt model — far heavier inference (~40ms) — so cap them lower so the
// inference doesn't back up into the "dots trail my face by ~1s" lag.
const MESH_LIVE_FPS = 15;
const r3 = (n: number) => Math.round(n * 1000) / 1000; // trim serialized track size

// Orientation fed to MediaPipe on iOS. Calibrated: feeding 'up' makes the FaceLandmarker output a
// clean upright face (p0 = vertical, p1 = eye axis), so reduce()'s iOS map is a plain axis swap. (The
// pinned frame.orientation default produced a 180°-rotated output that needed a reflection hack.)
const IOS_MESH_ORI = 'up';

type TrackSample = { t: number; lm: FaceLandmarks | null };
type TrackRec = { t0: number; lensId: string; frameAspect?: number; samples: TrackSample[] };

const SNAP = 0.22;       // a jump bigger than this snaps instead of easing (re-acquire / fast move)
// SMOOTH (EMA factor) and DEADBAND are track-aware — the mesh is far less jittery than BlazeFace, so
// it eases far less (snappier, less lag). Declared just below, after faceTrackKind is known.
// Hide debounce: when detection drops, hold the last pose and only hide once the face has been gone
// this long. Rides blinks / brief turns / single missed frames without strobing.
const HIDE_MS = 2000;

function ema(prev: FaceLandmarks, cur: FaceLandmarks, a: number): FaceLandmarks {
  const mix = (p: number, c: number) => p + (c - p) * a;
  const mixPt = (p: { x: number; y: number }, c: { x: number; y: number }) => ({ x: mix(p.x, c.x), y: mix(p.y, c.y) });
  // Blendshapes (mesh track only): ease toward the new values so jawOpen/blink don't strobe; reset to
  // the fresh set when one side lacks them (track switch / first frame).
  const bs = cur.bs && prev.bs
    ? {
        jawOpen: mix(prev.bs.jawOpen, cur.bs.jawOpen),
        smile: mix(prev.bs.smile, cur.bs.smile),
        blinkL: mix(prev.bs.blinkL, cur.bs.blinkL),
        blinkR: mix(prev.bs.blinkR, cur.bs.blinkR),
        browUp: mix(prev.bs.browUp, cur.bs.browUp),
      }
    : cur.bs;
  return {
    leftEye: mixPt(prev.leftEye, cur.leftEye),
    rightEye: mixPt(prev.rightEye, cur.rightEye),
    noseTip: mixPt(prev.noseTip, cur.noseTip),
    mouthCenter: mixPt(prev.mouthCenter, cur.mouthCenter),
    faceWidth: mix(prev.faceWidth, cur.faceWidth),
    roll: mix(prev.roll, cur.roll),
    bs,
    mesh: cur.mesh, // take the latest mesh (478 pts — too many to smooth, and it's debug-only)
  };
}

// SPIKE FLAG. true → use the 478-pt Face Landmarker ('faceMesh' plugin: richer, jitter-resistant
// anchors + blendshapes + transform matrix, heavier inference). false → the lightweight BlazeFace
// 6-keypoint detector ('faceLandmarks'). Both return the same { points: [[x,y]×6] } anchor contract,
// so the reduce()/orientation path below is shared; the mesh additionally returns { bs, m }. Flip
// this to A/B the two on-device. Falls back to BlazeFace automatically if the mesh plugin/model is
// missing from the build.
const USE_FACE_MESH = true;

// Two native plugins. Each returns { points: number[][] } ([[x,y]×6], 0..1 in the raw buffer space);
// the mesh one also returns { bs: {...}, m: number[16] }.
let blazePlugin: ReturnType<typeof VisionCameraProxy.initFrameProcessorPlugin> | undefined;
let meshPlugin: ReturnType<typeof VisionCameraProxy.initFrameProcessorPlugin> | undefined;
try { blazePlugin = VisionCameraProxy.initFrameProcessorPlugin('faceLandmarks', {}); } catch { blazePlugin = undefined; }
try { meshPlugin = VisionCameraProxy.initFrameProcessorPlugin('faceMesh', {}); } catch { meshPlugin = undefined; }
// Both plugins stay available and are chosen PER LENS in the hook (see useFaceTracking): mesh-
// rendering lenses use the heavy 478-pt FaceLandmarker; everything else uses the lightweight
// BlazeFace 6-keypoint detector, so the majority of lenses track at full rate instead of paying the
// mesh's ~40ms every frame.
const hasMesh = USE_FACE_MESH && !!meshPlugin;
const hasBlaze = !!blazePlugin;

/** Whether ANY native MediaPipe plugin is present in this build (gate Camera frameProcessor on it). */
export const faceTrackingAvailable = hasMesh || hasBlaze;
/** Coarse default ('mesh' if the heavy model is built). Per-lens routing in the hook overrides it. */
export const faceTrackKind: 'mesh' | 'blaze' = hasMesh ? 'mesh' : 'blaze';

// EMA factor + deadband per track type. BlazeFace is jumpier → eased more (0.18 on iOS) to mask
// flicker; the mesh is far cleaner so it chases each detection harder (snappier). Chosen per-lens in
// the hook from which detector that lens routes to.
const EMA = { mesh: 0.6, blaze: IS_ANDROID ? 0.55 : 0.18 };
const DEAD = { mesh: 0.006, blaze: 0.008 };

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
function reduce(points: number[][] | null | undefined, _aspect: number, orientation: string, _mirrored: boolean, _isMesh: boolean, meshRaw?: number[][]): FaceLandmarks | null {
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
    const am = (p: number[]) => {
      const p0 = p[0], p1 = p[1];
      const x = ll ? 1 - p1 : p1;
      const y = ll ? 1 - p0 : p0;
      return { x: x + ANDROID_DX, y: y + ANDROID_DY };
    };
    const le = am(points[LEFT_EYE]), re = am(points[RIGHT_EYE]), nose = am(points[NOSE_TIP]), mouth = am(points[MOUTH]);
    const er = am(points[EAR_R]), el = am(points[EAR_L]);
    return {
      leftEye: le, rightEye: re, noseTip: nose, mouthCenter: mouth,
      faceWidth: Math.hypot(el.x - er.x, el.y - er.y), roll: 0,
      mesh: meshRaw ? meshRaw.map(am) : undefined,
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
  return {
    leftEye: le,
    rightEye: re,
    noseTip: nose,
    mouthCenter: mouth,
    faceWidth: Math.hypot(earL.x - earR.x, earL.y - earR.y),
    roll: 0,
    mesh: meshRaw ? meshRaw.map(map) : undefined,
  };
}

// Returns a frame processor (attach to <Camera frameProcessor={...}>) and the latest reduced
// landmarks. `mirror` true for the front camera. Returns landmarks=null (and a no-op processor) if
// the plugin isn't built yet.
export function useFaceTracking(mirror = true, withMesh = false) {
  // Landmarks are delivered via an external store (a ref + listener set) rather than React state: at
  // LIVE_FPS, a setState here would re-render the ENTIRE host component (the whole ReactionRecorder /
  // StudioCapture tree) every frame. Consumers read them through <LiveFaceLens> (useSyncExternalStore),
  // so only the small overlay re-renders per frame — never the heavy parent.
  const landmarksRef = useRef<FaceLandmarks | null>(null);
  const listenersRef = useRef<Set<() => void>>(new Set());
  const emitLandmarks = useCallback(() => { listenersRef.current.forEach((l) => l()); }, []);
  const subscribeLandmarks = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);
  const getLandmarks = useCallback(() => landmarksRef.current, []);
  const [status, setStatus] = useState<string>('init'); // diagnostic: ok | null | <err>
  // Which native MediaPipe delegate loaded (GPU/CPU/none) — surfaced from the frame result so the app
  // can show it (logcat is suppressed on OnePlus release builds). Set once; rarely re-renders.
  const [delegate, setDelegate] = useState<string | null>(null);
  const delegateRef = useRef<string | null>(null);
  // TEMP profiling: native inference / total callback time, updated ~2x/sec so the badge doesn't
  // re-render at the frame rate.
  const [perf, setPerf] = useState<{ infer: number; total: number } | null>(null);
  const lastPerfRef = useRef(0);
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

  // Per-lens detector routing: mesh lenses → 478-pt FaceLandmarker; the rest → BlazeFace (fast).
  const meshActive = withMesh && hasMesh;
  // Easing/deadband follow the active detector. Held in refs so `push` (stable, []-deps) reads the
  // current value without being recreated (which would churn the frame processor).
  const emaRef = useRef(0.6);
  const deadRef = useRef(0.006);
  emaRef.current = meshActive ? EMA.mesh : EMA.blaze;
  deadRef.current = meshActive ? DEAD.mesh : DEAD.blaze;

  const push = useCallback((lm: FaceLandmarks | null, st: string, dele?: string, infMs?: number, totMs?: number) => {
    if (dele && dele !== delegateRef.current) { delegateRef.current = dele; setDelegate(dele); }
    if (infMs != null) {
      const tnow = Date.now();
      if (tnow - lastPerfRef.current > 500) { lastPerfRef.current = tnow; setPerf({ infer: infMs, total: totMs ?? infMs }); }
    }
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
      if (prev && moved < deadRef.current) { return; }
      // Ease toward the detection; snap on first acquire or a big jump so markers don't crawl.
      const out = prev && moved < SNAP ? ema(prev, lm, emaRef.current) : lm;
      smoothRef.current = out;
      landmarksRef.current = out;
      emitLandmarks();
    } else if (!hiddenRef.current && now - lastGoodRef.current > HIDE_MS) {
      hiddenRef.current = true;
      smoothRef.current = null;
      landmarksRef.current = null;
      emitLandmarks();
    }
  }, [emitLandmarks]);
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
    // Route per lens: mesh lenses → heavy 478-pt FaceLandmarker; the rest → lightweight BlazeFace.
    const wantMesh = withMesh && hasMesh;
    const activePlugin = wantMesh ? meshPlugin : (blazePlugin ?? meshPlugin);
    if (!activePlugin) { return; }
    // BlazeFace is cheap → full camera rate; the mesh is throttled so its ~40ms inference can't back up.
    const targetFps = wantMesh ? MESH_LIVE_FPS : ANCHOR_LIVE_FPS;
    runAtTargetFps(targetFps, () => {
      'worklet';
      // min/max is rotation-invariant, so this is the displayed portrait aspect regardless of sensor
      // orientation — the true space the keypoints live in.
      const aspect = Math.min(frame.width, frame.height) / Math.max(frame.width, frame.height);
      setAspectJs(aspect);
      const ori = String(frame.orientation);
      // VisionCamera throws "expected an Object" if the 2nd arg is explicitly undefined — always pass a
      // real object. Only ask for the full 478-pt mesh when a mesh lens needs it.
      const res = (wantMesh ? activePlugin.call(frame, { mesh: true, ori: IOS_MESH_ORI }) : activePlugin.call(frame, { ori: IOS_MESH_ORI })) as unknown as
        { points?: number[][]; bs?: FaceBlendshapes; mesh?: number[][]; err?: string; delegate?: string; msInfer?: number; msTotal?: number } | null;
      if (res && res.points) {
        const lm = reduce(res.points, aspect, ori, false, wantMesh, res.mesh);
        // Carry the mesh blendshapes through (BlazeFace returns none). faceFrame() prefers jawOpen
        // over the geometric mouth-open proxy and exposes blink/smile/browRaise when present.
        if (lm && res.bs) { lm.bs = res.bs; }
        pushJs(lm, 'ok', res.delegate, res.msInfer, res.msTotal);
      } else { pushJs(null, (res && res.err) || 'null', res?.delegate, res?.msInfer, res?.msTotal); }
    });
  }, [pushJs, setAspectJs, mirror, withMesh]);

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
      // Mesh lenses: persist the compact contour-subset mesh so the lens replays (full 478 is too big).
      if (lm?.mesh) { meshFrames[i] = quantizeMesh(lm.mesh, MESH_TRACK_INDICES); hasMesh = true; }
    }
    const track: FaceLensTrack = { lensId: rec.lensId, fps: TRACK_FPS, frames, frameAspect: rec.frameAspect };
    if (hasMesh) { track.meshIdx = MESH_TRACK_INDICES; track.meshFrames = meshFrames; }
    return track;
  }, []);

  return { frameProcessor, subscribeLandmarks, getLandmarks, status, delegate, perf, trackKind: meshActive ? 'mesh' : 'blaze', frameAspect, startTrack, stopTrack, cancelTrack };
}
