import { useEffect } from 'react';
import { Skia, type SkPaint, type SkRuntimeEffect } from '@shopify/react-native-skia';
import { useSkiaFrameProcessor, VisionCameraProxy, runAtTargetFps } from 'react-native-vision-camera';
import { Worklets, useSharedValue as useWorkletSharedValue } from 'react-native-worklets-core';
import type { WarpKey } from './core';

// ─── Real camera-warp lenses ───────────────────────────────────────────────────
//
// Unlike the Skia *overlay* lenses (which draw art on top of the camera), these bend the camera's
// pixels — fun-house distortions of the user's real face. Each uses VisionCamera's Skia frame
// processor: every frame is drawn through a Skia canvas with a RuntimeShader (SkSL) image filter
// that, per output pixel, samples the source from a displaced coordinate.
//
// MEMORY: the frame-processor worklet runs on a runtime with NO garbage collection, so allocating
// Skia objects (paint/filter/builder) every frame leaks until the OS kills the app. We avoid that:
// because MakeRuntimeShader(builder, null, null) binds the child to the *implicit source frame*, the
// paint depends only on the face uniforms — not the frame — so we build it on the JS thread whenever
// the face moves (~15fps, GC'd) and reuse that one paint for every render. The per-frame worklet
// allocates nothing.
//
// Coordinates stay in RAW frame-buffer space: MediaPipe returns normalized points in the same buffer
// the shader samples, so px = point × frameSize needs no orientation/mirror math — frame.render()
// rotates the image AND the warp together for the preview.
//
// NOTE: preview-only. VisionCamera records the original (unwarped) frames; baking the warp into the
// recording/replay is a follow-up. (Warp lenses still register an overlay `Comp` for replay.)

// A magnify/pinch bulge around two centres (the eyes). strength>0 magnifies, <0 shrinks.
const EYE_BULGE = `
uniform shader image;
uniform float2 eyeL; uniform float2 eyeR; uniform float radius; uniform float strength;
half4 main(float2 xy) {
  float2 coord = xy;
  float2 dL = xy - eyeL; float distL = length(dL);
  if (distL < radius) { float pct = 1.0 - distL / radius; coord = coord - dL * (pct * pct * strength); }
  float2 dR = xy - eyeR; float distR = length(dR);
  if (distR < radius) { float pct = 1.0 - distR / radius; coord = coord - dR * (pct * pct * strength); }
  return image.eval(coord);
}`;

// A single-centre bulge (whole head). strength>0 enlarges the face, <0 shrinks it.
const BULGE = `
uniform shader image;
uniform float2 center; uniform float radius; uniform float strength;
half4 main(float2 xy) {
  float2 coord = xy;
  float2 d = xy - center; float dist = length(d);
  if (dist < radius) { float pct = 1.0 - dist / radius; coord = coord - d * (pct * pct * strength); }
  return image.eval(coord);
}`;

// A vortex twist around a centre — pixels rotate more the closer they are to the middle.
const SWIRL = `
uniform shader image;
uniform float2 center; uniform float radius; uniform float angle;
half4 main(float2 xy) {
  float2 coord = xy;
  float2 d = xy - center; float dist = length(d);
  if (dist < radius) {
    float pct = 1.0 - dist / radius;
    float t = angle * pct * pct;
    float s = sin(t), c = cos(t);
    coord = center + float2(d.x * c - d.y * s, d.x * s + d.y * c);
  }
  return image.eval(coord);
}`;

// Each warp key maps to a compiled effect + a strength-style parameter. `eyes` uses the two-centre
// shader; the rest use a single centre.
const EFFECTS: Record<string, SkRuntimeEffect | null> = {
  eyes: Skia.RuntimeEffect.Make(EYE_BULGE),
  bulge: Skia.RuntimeEffect.Make(BULGE),
  swirl: Skia.RuntimeEffect.Make(SWIRL),
};

const RIGHT_EYE = 0, LEFT_EYE = 1, NOSE = 2, MOUTH = 3;

let plugin: ReturnType<typeof VisionCameraProxy.initFrameProcessorPlugin> | undefined;
try { plugin = VisionCameraProxy.initFrameProcessorPlugin('faceLandmarks', {}); } catch { plugin = undefined; }

/** True when the native plugin and all warp shaders compiled — gate warp lenses on this. */
export const warpLensAvailable = !!plugin && Object.values(EFFECTS).every(Boolean);

// Build the warp paint for a given warp + face keypoints (JS thread — GC runs here). pts are the 6
// normalized BlazeFace keypoints; w/h are the raw frame size.
function buildWarpPaint(warp: WarpKey, pts: number[][], w: number, h: number): SkPaint | null {
  const lx = pts[LEFT_EYE][0] * w, ly = pts[LEFT_EYE][1] * h;
  const rx = pts[RIGHT_EYE][0] * w, ry = pts[RIGHT_EYE][1] * h;
  const nx = pts[NOSE][0] * w, ny = pts[NOSE][1] * h;
  const moX = pts[MOUTH][0] * w, moY = pts[MOUTH][1] * h;
  const eyeSpan = Math.hypot(rx - lx, ry - ly);
  // Face centre ≈ midway between the eye line and the mouth; face span scales the affected radius.
  const cx = ((lx + rx) / 2 + moX) / 2, cy = ((ly + ry) / 2 + moY) / 2;
  const faceSpan = Math.max(eyeSpan * 2.2, Math.hypot(moX - (lx + rx) / 2, moY - (ly + ry) / 2) * 2.4);

  const make = (effect: SkRuntimeEffect | null, set: (b: ReturnType<typeof Skia.RuntimeShaderBuilder>) => void) => {
    if (!effect) { return null; }
    const b = Skia.RuntimeShaderBuilder(effect);
    set(b);
    const paint = Skia.Paint();
    paint.setImageFilter(Skia.ImageFilter.MakeRuntimeShader(b, null, null));
    return paint;
  };

  switch (warp) {
    case 'eyes':
      return make(EFFECTS.eyes, b => {
        b.setUniform('eyeL', [lx, ly]); b.setUniform('eyeR', [rx, ry]);
        b.setUniform('radius', [eyeSpan * 1.15]); b.setUniform('strength', [0.55]);
      });
    case 'bighead':
      return make(EFFECTS.bulge, b => {
        b.setUniform('center', [cx, cy]); b.setUniform('radius', [faceSpan * 1.5]); b.setUniform('strength', [0.42]);
      });
    case 'tinyface':
      return make(EFFECTS.bulge, b => {
        b.setUniform('center', [cx, cy]); b.setUniform('radius', [faceSpan * 1.6]); b.setUniform('strength', [-0.5]);
      });
    case 'swirl':
      return make(EFFECTS.swirl, b => {
        b.setUniform('center', [nx, ny]); b.setUniform('radius', [faceSpan * 1.7]); b.setUniform('angle', [2.4]);
      });
    default:
      return null;
  }
}

/**
 * A Skia frame processor that applies the given camera-warp to the live preview. Detection is
 * throttled and the warp paint is rebuilt (on JS) only when the face moves; every frame just renders
 * with the current paint, so the worklet does no per-frame allocation. Pass null (non-warp lens) for
 * a passthrough processor.
 */
export function useWarpFrameProcessor(warp: WarpKey | null) {
  // Current warp paint, shared into the frame-processor worklet. Rebuilt on the JS thread when the
  // detected face moves; null → render the frame untouched (no warp / no face yet).
  const paint = useWorkletSharedValue<SkPaint | null>(null);

  const setPaint = Worklets.createRunOnJS((pts: number[][], w: number, h: number) => {
    paint.value = warp ? buildWarpPaint(warp, pts, w, h) : null;
  });

  // Drop the paint when the warp changes or unmounts so GC can reclaim it and a stale warp never shows.
  useEffect(() => { paint.value = null; return () => { paint.value = null; }; }, [paint, warp]);

  return useSkiaFrameProcessor((frame) => {
    'worklet';
    if (warp) {
      runAtTargetFps(15, () => {
        'worklet';
        if (!plugin) { return; }
        const res = plugin.call(frame) as unknown as { points?: number[][] } | null;
        const pts = res?.points;
        if (pts && pts.length >= 6) { setPaint(pts, frame.width, frame.height); }
      });
    }
    const p = paint.value;
    if (p) { frame.render(p); } else { frame.render(); }
  }, [warp]);
}
