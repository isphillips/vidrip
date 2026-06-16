import { useCallback, useRef, useState } from 'react';
import { useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import type { FaceLandmarks, FaceLensTrack } from './faceLens';

// Replay sampling rate for the captured track. Matches the ~15fps live overlay throttle below,
// so the recorded lens looks the same on playback as it did live.
const TRACK_FPS = 15;
const r3 = (n: number) => Math.round(n * 1000) / 1000; // trim serialized track size

type TrackSample = { t: number; lm: FaceLandmarks | null };
type TrackRec = { t0: number; lensId: string; frameAspect?: number; samples: TrackSample[] };

// MediaPipe's landmarks flicker frame-to-frame, so we smooth toward each new detection with an
// EMA: out += SMOOTH·(new − out). Higher = snappier/noisier, lower = calmer/laggier.
const SMOOTH = 0.18;
// A large jump (re-acquire / fast move) snaps instead of easing, so the markers don't crawl.
const SNAP = 0.22;
// Small upward calibration nudge (normalized frame units) — the mapped landmarks sit a touch low.
const Y_OFFSET = -0.08;
// Resting deadband: when the face is basically still, hold the last pose instead of chasing
// MediaPipe's micro-jitter (which the centroid-reflection amplifies). Real movement exceeds it.
const DEADBAND = 0.008;
// Hide debounce: keep showing the last pose through brief detector drops, hide once the face has
// genuinely been gone this long. Stops the strobe without leaving the lens up when you exit frame.
const HIDE_MS = 250;

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

// The native plugin runs MediaPipe FaceLandmarker and returns the raw normalized mesh:
//   { points: number[][] }  // 478 [x,y] pairs, 0..1 in display orientation
// or null when no face. Keeping the native side thin means the index→anchor mapping below
// (and any tuning) lives in JS — no rebuild to adjust.
let plugin: ReturnType<typeof VisionCameraProxy.initFrameProcessorPlugin> | undefined;
try { plugin = VisionCameraProxy.initFrameProcessorPlugin('faceLandmarks', {}); } catch { plugin = undefined; }

/** Whether the native MediaPipe plugin is present in this build (gate Camera frameProcessor on it). */
export const faceTrackingAvailable = !!plugin;

// MediaPipe face-mesh indices (478-pt model, includes iris).
const RIGHT_IRIS = 468; // subject's right eye
const LEFT_IRIS = 473;  // subject's left eye
const NOSE_TIP = 1;
const LIP_TOP = 13;
const LIP_BOTTOM = 14;
const CHEEK_R = 234;
const CHEEK_L = 454;

// Reduce the raw mesh to our anchors. Front camera preview is mirrored, so flip x to match
// what the user sees (so a lens on "left eye" lands on the on-screen left).
function reduce(points: number[][] | null | undefined, mirror: boolean): FaceLandmarks | null {
  'worklet';
  if (!points || points.length < 478) { return null; }
  // Measured from movement (move right → p1 down, move up → p0 down): the tracking-correct mapping
  // is x = 1−p1, y = p0 (markers follow the face). But MediaPipe detects this camera's face
  // upside-down (nose ends up above the eyes with y = p0), so we then mirror y about the FACE'S OWN
  // centre — that flips the arrangement upright while keeping the face's screen position, so it
  // still tracks (a plain 1−p0 would re-invert the tracking). `mirror` flips x for the selfie.
  const pt = (i: number) => {
    const p = points[i];
    let x = 1 - p[1];
    const y = p[0];
    if (!mirror) { x = 1 - x; }
    return { x, y };
  };
  const le = pt(LEFT_IRIS), re = pt(RIGHT_IRIS);
  const lipT = pt(LIP_TOP), lipB = pt(LIP_BOTTOM);
  const cR = pt(CHEEK_R), cL = pt(CHEEK_L);
  const nose = pt(NOSE_TIP);
  const mouth = { x: (lipT.x + lipB.x) / 2, y: (lipT.y + lipB.y) / 2 };
  // Mirror about the face centre (both axes): y-flip fixes the upside-down detection, x-flip gives
  // the selfie mirror — both reflect about the face's own centroid so the face's screen position is
  // preserved and tracking still holds.
  const cx = (le.x + re.x + nose.x + mouth.x) / 4;
  const cy = (le.y + re.y + nose.y + mouth.y) / 4;
  const flip = (p: { x: number; y: number }) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y - Y_OFFSET });
  return {
    leftEye: flip(le),
    rightEye: flip(re),
    noseTip: flip(nose),
    mouthCenter: flip(mouth),
    faceWidth: Math.hypot(cL.x - cR.x, cL.y - cR.y),
    roll: 0,
  };
}

// Returns a frame processor (attach to <Camera frameProcessor={...}>) and the latest reduced
// landmarks. Sampled at ~15fps — plenty for an overlay, and cheap. `mirror` true for the
// front camera. Returns landmarks=null (and a no-op processor) if the plugin isn't built yet.
export function useFaceTracking(mirror = true) {
  const [landmarks, setLandmarks] = useState<FaceLandmarks | null>(null);
  const [status, setStatus] = useState<string>('init'); // diagnostic: ok | no_model | no_image | detect_fail | no_face
  // Push every processed frame through to the overlay (the frame processor already paces this to
  // the camera fps) so the lens tracks the face responsively; createRunOnJS bridges the
  // frame-processor thread → JS.
  const statusRef = useRef('init'); // avoid re-rendering on unchanged status
  const smoothRef = useRef<FaceLandmarks | null>(null); // running EMA-smoothed pose
  const lastGoodRef = useRef(0);    // last frame a face was detected (hide debounce)
  const hiddenRef = useRef(true);   // whether markers are currently hidden (avoid redundant sets)
  const recRef = useRef<TrackRec | null>(null); // active capture (during recording)
  const push = useCallback((lm: FaceLandmarks | null, st: string) => {
    if (st !== statusRef.current) { statusRef.current = st; setStatus(st); }
    const now = Date.now();
    // While recording, log every processed frame (raw rate) keyed to recording-start —
    // resampled to a fixed grid on stop. Captures nulls too (no-face gaps in the track).
    const rec = recRef.current;
    if (rec) { rec.samples.push({ t: now - rec.t0, lm }); }
    if (lm) {
      lastGoodRef.current = now;
      hiddenRef.current = false;
      // Smooth toward the new detection to kill MediaPipe's frame-to-frame flicker. Snap (don't
      // ease) on first acquire or a big move so the markers don't crawl into place.
      const prev = smoothRef.current;
      const moved = prev ? Math.hypot(lm.noseTip.x - prev.noseTip.x, lm.noseTip.y - prev.noseTip.y) : 1;
      if (prev && moved < DEADBAND) { return; } // basically still → hold, don't chase jitter
      const out = prev && moved < SNAP ? ema(prev, lm, SMOOTH) : lm;
      smoothRef.current = out;
      setLandmarks(out);
    } else if (!hiddenRef.current && now - lastGoodRef.current > HIDE_MS) {
      // No face for a sustained moment → hide. The debounce rides single dropped frames so the
      // markers don't strobe (the detector blinks even while a face is plainly present).
      hiddenRef.current = true;
      smoothRef.current = null;
      setLandmarks(null);
    }
  }, []);
  const pushJs = Worklets.createRunOnJS(push);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!plugin) { return; }
    const res = plugin.call(frame) as unknown as { points?: number[][]; err?: string } | null;
    if (res && res.points) { pushJs(reduce(res.points, mirror), 'ok'); }
    else { pushJs(null, (res && res.err) || 'null'); }
  }, [pushJs, mirror]);

  // ── Track capture ──────────────────────────────────────────────────────────
  // Start when recording begins; stop returns a time-sampled FaceLensTrack to persist with the
  // clip; cancel discards (restart/exit). The selfie video is the timing master on replay, so
  // we key samples to recording-start and resample to a fixed fps grid.
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
      // advance to the last sample at/just before this grid time
      while (si + 1 < rec.samples.length && rec.samples[si + 1].t <= tMs) { si++; }
      // pick whichever of the bracketing samples is closer in time
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

  return { frameProcessor, landmarks, status, startTrack, stopTrack, cancelTrack };
}
