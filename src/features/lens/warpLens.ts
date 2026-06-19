import { useEffect, useMemo, useRef } from 'react';
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

// Chromatic-glitch: split the R/G/B channels and jitter horizontal bands — a broken-screen /
// cyberpunk aberration. Doesn't need the face; applies to the whole frame.
const GLITCH = `
uniform shader image;
uniform float amount;
half4 main(float2 xy) {
  float band = floor(xy.y / 22.0);
  float r = fract(sin(band * 91.7) * 4391.0);
  float shift = (r - 0.5) * amount * 8.0 * step(0.72, r);
  float2 p = xy + float2(shift, 0.0);
  half4 c;
  c.r = image.eval(p + float2(amount, 0.0)).r;
  c.g = image.eval(p).g;
  c.b = image.eval(p - float2(amount, 0.0)).b;
  c.a = 1.0;
  return c;
}`;

// Kaleidoscope: fold the frame into mirrored radial wedges around the centre.
const KALEIDO = `
uniform shader image;
uniform float2 center;
uniform float segments;
half4 main(float2 xy) {
  float2 d = xy - center;
  float r = length(d);
  float a = atan(d.y, d.x);
  float seg = 6.2831853 / segments;
  a = mod(a, seg);
  a = abs(a - seg * 0.5);            // mirror within the wedge for a seamless join
  float2 p = center + float2(cos(a), sin(a)) * r;
  return image.eval(p);
}`;

// Beauty skin-retouch: a 9-tap tent blur blended back toward the source (`strength`) — the ubiquitous
// "soft skin" look. `texel` is the blur step in frame-buffer px. Full-frame, no face needed.
const SMOOTH = `
uniform shader image;
uniform float2 texel; uniform float strength;
half4 main(float2 xy) {
  half4 c = image.eval(xy);
  half4 b = c * 4.0;
  b += (image.eval(xy + float2(texel.x, 0.0)) + image.eval(xy - float2(texel.x, 0.0))) * 2.0;
  b += (image.eval(xy + float2(0.0, texel.y)) + image.eval(xy - float2(0.0, texel.y))) * 2.0;
  b += image.eval(xy + texel) + image.eval(xy - texel);
  b += image.eval(xy + float2(texel.x, -texel.y)) + image.eval(xy + float2(-texel.x, texel.y));
  b /= 16.0;
  return mix(c, b, strength);
}`;

// Beauty glow: skin-smooth (as above), then screen-blend a brightened blur for a soft bloom and warm
// the result slightly — a flattering "lit-from-within" finish.
const GLOW = `
uniform shader image;
uniform float2 texel; uniform float strength; uniform float glow;
half4 main(float2 xy) {
  half4 c = image.eval(xy);
  half4 b = c * 4.0;
  b += (image.eval(xy + float2(texel.x, 0.0)) + image.eval(xy - float2(texel.x, 0.0))) * 2.0;
  b += (image.eval(xy + float2(0.0, texel.y)) + image.eval(xy - float2(0.0, texel.y))) * 2.0;
  b += image.eval(xy + texel) + image.eval(xy - texel);
  b += image.eval(xy + float2(texel.x, -texel.y)) + image.eval(xy + float2(-texel.x, texel.y));
  b /= 16.0;
  half3 soft = mix(c.rgb, b.rgb, strength);
  half3 bloom = 1.0 - (1.0 - soft) * (1.0 - b.rgb * glow);   // screen blend the bright blur
  bloom.r = min(1.0, bloom.r * 1.04 + 0.015);                // warm highlights
  bloom.b = bloom.b * 0.98;
  return half4(bloom, c.a);
}`;

// The compiled shaders, keyed by program. `eyes` uses the two-centre shader; bulge/swirl use a single
// centre; glitch/kaleido/smooth/glow are full-frame. Make() returns null on a compile failure rather
// than throwing, so a shader the platform's Skia rejects shows up here as null (see warning below)
// instead of crashing.
type EffectKey = 'eyes' | 'bulge' | 'swirl' | 'glitch' | 'kaleido' | 'smooth' | 'glow';
const EFFECTS: Record<EffectKey, SkRuntimeEffect | null> = {
  eyes: Skia.RuntimeEffect.Make(EYE_BULGE),
  bulge: Skia.RuntimeEffect.Make(BULGE),
  swirl: Skia.RuntimeEffect.Make(SWIRL),
  glitch: Skia.RuntimeEffect.Make(GLITCH),
  kaleido: Skia.RuntimeEffect.Make(KALEIDO),
  smooth: Skia.RuntimeEffect.Make(SMOOTH),
  glow: Skia.RuntimeEffect.Make(GLOW),
};

// Which shader each warp lens drives.
const WARP_EFFECT: Record<WarpKey, EffectKey> = {
  eyes: 'eyes', bighead: 'bulge', tinyface: 'bulge', swirl: 'swirl', glitch: 'glitch', kaleido: 'kaleido',
  smooth: 'smooth', glow: 'glow',
};

// Warps that don't need face keypoints — built from frame size alone (apply with or without a face,
// and crucially without the BlazeFace plugin). Beauty skin-retouch is full-frame, so it lives here too.
const FACELESS = new Set<WarpKey>(['glitch', 'kaleido', 'smooth', 'glow']);

const RIGHT_EYE = 0, LEFT_EYE = 1, NOSE = 2, MOUTH = 3;

let plugin: ReturnType<typeof VisionCameraProxy.initFrameProcessorPlugin> | undefined;
try { plugin = VisionCameraProxy.initFrameProcessorPlugin('faceLandmarks', {}); } catch { plugin = undefined; }

// Diagnostics: surface *why* a warp would be unavailable instead of silently disabling the whole
// category. (Android's "the warps won't load" is almost always one of these two lines in logcat.)
if (__DEV__) {
  const failed = (Object.keys(EFFECTS) as EffectKey[]).filter(k => !EFFECTS[k]);
  if (failed.length) { console.warn(`[warpLens] shader compile failed: ${failed.join(', ')} — those warps are disabled`); }
  if (!plugin) { console.warn('[warpLens] faceLandmarks plugin not registered — face warps disabled (glitch/kaleido still work)'); }
}

/**
 * Whether a specific warp can run. Per-warp, not all-or-nothing: a shader that fails to compile only
 * disables warps that use it, and the faceless warps (glitch/kaleido) don't need the BlazeFace plugin
 * — so they stay available even when the plugin is missing.
 */
export function warpAvailable(warp: WarpKey): boolean {
  if (!EFFECTS[WARP_EFFECT[warp]]) { return false; }
  return FACELESS.has(warp) || !!plugin;
}

/** True when at least one warp lens can run. (Prefer warpAvailable(key) for a specific lens.) */
export const warpLensAvailable = (Object.keys(WARP_EFFECT) as WarpKey[]).some(warpAvailable);

// The face anchors a warp is built from, in raw frame-buffer px. Computed once per rebuild and shared
// by both the paint builder and the movement gate, so the two can never disagree.
type FaceAnchors = {
  lx: number; ly: number; rx: number; ry: number; nx: number; ny: number;
  cx: number; cy: number; eyeSpan: number; faceSpan: number;
};

// Reduce the 6 normalized BlazeFace keypoints to the px anchors the shaders use. Returns null when
// there's no usable face. w/h are the raw frame size.
function faceAnchors(pts: number[][], w: number, h: number): FaceAnchors | null {
  if (pts.length < 6) { return null; }
  const lx = pts[LEFT_EYE][0] * w, ly = pts[LEFT_EYE][1] * h;
  const rx = pts[RIGHT_EYE][0] * w, ry = pts[RIGHT_EYE][1] * h;
  const nx = pts[NOSE][0] * w, ny = pts[NOSE][1] * h;
  const moX = pts[MOUTH][0] * w, moY = pts[MOUTH][1] * h;
  const eyeSpan = Math.hypot(rx - lx, ry - ly);
  // Face centre ≈ midway between the eye line and the mouth; face span scales the affected radius.
  const cx = ((lx + rx) / 2 + moX) / 2, cy = ((ly + ry) / 2 + moY) / 2;
  const faceSpan = Math.max(eyeSpan * 2.2, Math.hypot(moX - (lx + rx) / 2, moY - (ly + ry) / 2) * 2.4);
  return { lx, ly, rx, ry, nx, ny, cx, cy, eyeSpan, faceSpan };
}

// The px coords that move the warp — its movement signature. We rebuild the paint only when these
// shift past a threshold (see useWarpFrameProcessor), so a still face allocates nothing.
function warpSignature(warp: WarpKey, a: FaceAnchors): number[] {
  switch (warp) {
    case 'eyes': return [a.lx, a.ly, a.rx, a.ry];
    case 'swirl': return [a.nx, a.ny];
    default: return [a.cx, a.cy]; // bighead / tinyface
  }
}

const make = (effect: SkRuntimeEffect | null, set: (b: ReturnType<typeof Skia.RuntimeShaderBuilder>) => void): SkPaint | null => {
  if (!effect) { return null; }
  const b = Skia.RuntimeShaderBuilder(effect);
  set(b);
  const paint = Skia.Paint();
  paint.setImageFilter(Skia.ImageFilter.MakeRuntimeShader(b, null, null));
  return paint;
};

// Build the paint for a faceless warp — depends only on the frame size, so it's built once and reused.
function buildFacelessPaint(warp: WarpKey, w: number, h: number): SkPaint | null {
  if (warp === 'glitch') { return make(EFFECTS.glitch, b => { b.setUniform('amount', [4]); }); }
  if (warp === 'kaleido') { return make(EFFECTS.kaleido, b => { b.setUniform('center', [w / 2, h / 2]); b.setUniform('segments', [8]); }); }
  if (warp === 'smooth') {
    const t = Math.max(1.5, w * 0.004);
    return make(EFFECTS.smooth, b => { b.setUniform('texel', [t, t]); b.setUniform('strength', [0.6]); });
  }
  if (warp === 'glow') {
    const t = Math.max(2, w * 0.006);
    return make(EFFECTS.glow, b => { b.setUniform('texel', [t, t]); b.setUniform('strength', [0.55]); b.setUniform('glow', [0.35]); });
  }
  return null;
}

// Build the warp paint for a face warp from precomputed anchors (JS thread — GC runs here).
function buildFacePaint(warp: WarpKey, a: FaceAnchors): SkPaint | null {
  switch (warp) {
    case 'eyes':
      return make(EFFECTS.eyes, b => {
        b.setUniform('eyeL', [a.lx, a.ly]); b.setUniform('eyeR', [a.rx, a.ry]);
        b.setUniform('radius', [a.eyeSpan * 1.15]); b.setUniform('strength', [0.55]);
      });
    case 'bighead':
      return make(EFFECTS.bulge, b => {
        b.setUniform('center', [a.cx, a.cy]); b.setUniform('radius', [a.faceSpan * 1.5]); b.setUniform('strength', [0.42]);
      });
    case 'tinyface':
      return make(EFFECTS.bulge, b => {
        b.setUniform('center', [a.cx, a.cy]); b.setUniform('radius', [a.faceSpan * 1.6]); b.setUniform('strength', [-0.5]);
      });
    case 'swirl':
      return make(EFFECTS.swirl, b => {
        b.setUniform('center', [a.nx, a.ny]); b.setUniform('radius', [a.faceSpan * 1.7]); b.setUniform('angle', [2.4]);
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
// Rebuild the face-warp paint only once the tracked anchors move more than this many px. Below it the
// shift is imperceptible after the warp, so we reuse the existing paint and allocate nothing.
const MOVE_EPS = 2.5;

export function useWarpFrameProcessor(warp: WarpKey | null) {
  // Current warp paint, shared into the frame-processor worklet. Rebuilt on the JS thread when the
  // detected face moves; null → render the frame untouched (no warp / no face yet).
  const paint = useWorkletSharedValue<SkPaint | null>(null);

  // JS-thread-only bookkeeping (never touched by the worklet, so always GC'd normally):
  //  - sig: the last face signature we built from, for the movement gate.
  //  - stale: the paint we just superseded. It may still be mid-render on the frame-processor thread
  //    the instant we swap, so we don't free it now — we free it on the *next* rebuild, by which point
  //    (≥1 throttle tick / tens of ms later) no render can still be holding it. This bounds native
  //    memory without the use-after-free a same-tick dispose would risk.
  const js = useRef<{ sig: number[] | null; stale: SkPaint | null }>({ sig: null, stale: null });

  const setPaint = useMemo(() => Worklets.createRunOnJS((pts: number[][], w: number, h: number) => {
    const s = js.current;
    if (!warp) { return; }

    let next: SkPaint | null;
    if (FACELESS.has(warp)) {
      if (paint.value) { return; }           // depends only on frame size — build once, then never again
      next = buildFacelessPaint(warp, w, h);
    } else {
      const a = faceAnchors(pts, w, h);
      if (!a) { return; }                    // no usable face — keep whatever's showing
      const sig = warpSignature(warp, a);
      if (paint.value && s.sig && sig.every((v, i) => Math.abs(v - s.sig![i]) < MOVE_EPS)) { return; }
      const built = buildFacePaint(warp, a);
      if (!built) { return; }                // build failed — keep the last good paint
      next = built;
      s.sig = sig;
    }

    if (s.stale) { s.stale.dispose(); }      // free the generation before last — provably idle now
    s.stale = paint.value;
    paint.value = next;
  }), [warp, paint]);

  // On warp change / unmount: stop rendering the old warp and reclaim its native memory. The current
  // paint may be mid-render, so hand it to `stale` for deferred disposal rather than freeing it here.
  useEffect(() => {
    const s = js.current;
    return () => {
      if (s.stale) { s.stale.dispose(); s.stale = null; }
      s.stale = paint.value;
      paint.value = null;
      s.sig = null;
    };
  }, [paint, warp]);

  const faceless = !!warp && FACELESS.has(warp);

  return useSkiaFrameProcessor((frame) => {
    'worklet';
    if (faceless) {
      // No detection needed — build once from the frame size (setPaint no-ops after the first).
      runAtTargetFps(2, () => { 'worklet'; setPaint([], frame.width, frame.height); });
    } else if (warp) {
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
  }, [warp, faceless]);
}
