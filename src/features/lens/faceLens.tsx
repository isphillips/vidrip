import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Group } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { faceFrame, useLensClock, dequantizeMesh, type FaceLandmarks, type FaceLensTrack } from './core';
import { lensByKey } from './lenses';
import { ANON_LENS_KEY } from './useAnonymousMode';

// Opaque black cover — the privacy fail-safe for anonymous mode when no face is tracked this frame.
const Blackout = () => <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} pointerEvents="none" />;

// Public entry point for the AR face-lens system. The lens infrastructure lives in ./core (types,
// the face-frame mapping, the clock, shapes, primitives) and each lens is its own file in ./lenses,
// registered in ./lenses/index. This module hosts the two render surfaces (live overlay + replay)
// and re-exports the public API so existing imports from '.../faceLens' keep working.

export type { Pt, FaceLandmarks, FaceFrame, Lens, LensProps, FaceLensTrack } from './core';
export { faceFrame, off } from './core';
export { LENSES, lensByKey, lensCategory } from './lenses';
export type { LensCategory } from './core';

// ─── Overlay ─────────────────────────────────────────────────────────────────
// Renders the active lens into one Skia <Canvas> over the camera/video, anchored to the current
// landmarks. `animate` drives the clock (true for the live camera + replay; false for the static
// picker previews so the grid doesn't spin up a frame loop per cell). Renders nothing with no face.
// Step 2 — render/inference decoupling. The mesh inference is ~20fps-bound on-device, so when
// `interpolate` is set (the LIVE path) we predict the head pose forward on the UI thread between
// inferences and ride the whole lens on a Skia <Group> transform at display rate — the lens content
// is a per-inference "picture", the transform tracks the face at 60fps with NO extra React renders.
// Replay/picker pass interpolate=false (exact sampled poses, no prediction).
const LEAD_BASE = 0.012;  // seconds of forward prediction added on top of the elapsed-since-pose time
const LEAD_MAX = 0.05;    // clamp the prediction horizon so a stalled/lost face can't fly off
const VEL_EMA = 0.4;      // smoothing on the per-inference velocity estimate (kills jitter + overshoot)
export default function FaceLensOverlay({
  lens, landmarks, width, height, frameAspect, animate = true, interpolate = false,
}: { lens?: string | null; landmarks?: FaceLandmarks | null; width: number; height: number; frameAspect?: number; animate?: boolean; interpolate?: boolean }) {
  const def = lensByKey(lens);
  const show = !!def && !!landmarks && width > 0 && height > 0;
  const clock = useLensClock(animate && show);

  // Head pose (eye-mid center, roll rad, faceW scale) for the current + previous inference, plus the
  // clock time each was set — drives the predicted delta transform below.
  const cx = useSharedValue(0), cy = useSharedValue(0), rot = useSharedValue(0), scl = useSharedValue(1), tR = useSharedValue(0);
  // Smoothed per-second velocity of the head pose (EMA across inferences). Smoothing HERE is what kills
  // the prediction jitter/overshoot that a raw two-sample velocity produces.
  const vx = useSharedValue(0), vy = useSharedValue(0), vr = useSharedValue(0), vs = useSharedValue(0);
  const poseRef = useRef<{ cx: number; cy: number; rot: number; scl: number } | null>(null);
  const initRef = useRef(false);
  useEffect(() => {
    if (!interpolate || !poseRef.current) { return; }
    const p = poseRef.current;
    const tNow = clock.value;
    const dtPrev = tNow - tR.value;
    // EMA the instantaneous velocity (prev→new pose) so it doesn't jump each inference.
    if (initRef.current && dtPrev > 0.005 && dtPrev < 0.5) {
      vx.value = vx.value * (1 - VEL_EMA) + ((p.cx - cx.value) / dtPrev) * VEL_EMA;
      vy.value = vy.value * (1 - VEL_EMA) + ((p.cy - cy.value) / dtPrev) * VEL_EMA;
      vr.value = vr.value * (1 - VEL_EMA) + ((p.rot - rot.value) / dtPrev) * VEL_EMA;
      vs.value = vs.value * (1 - VEL_EMA) + ((p.scl - scl.value) / dtPrev) * VEL_EMA;
    }
    cx.value = p.cx; cy.value = p.cy; rot.value = p.rot; scl.value = p.scl; tR.value = tNow;
    initRef.current = true;
  }, [landmarks, interpolate, cx, cy, rot, scl, tR, vx, vy, vr, vs, clock]);

  // Predicted delta on the UI thread: ride the SMOOTHED velocity forward ~LEAD seconds, clamped so a
  // re-acquire jump can't throw the lens across the screen.
  const poseDelta = useDerivedValue(() => {
    const dt = Math.max(0, clock.value - tR.value);
    const lead = Math.min(dt + LEAD_BASE, LEAD_MAX);
    const maxT = 0.6 * scl.value;
    const px = cx.value + Math.max(-maxT, Math.min(maxT, vx.value * lead));
    const py = cy.value + Math.max(-maxT, Math.min(maxT, vy.value * lead));
    const dRot = Math.max(-0.4, Math.min(0.4, vr.value * lead));
    let sRatio = scl.value > 0 ? (scl.value + vs.value * lead) / scl.value : 1;
    sRatio = Math.max(0.9, Math.min(1.15, sRatio));
    // map content (anchored at the rendered pose cx,cy,rot,scl) → predicted pose
    return [
      { translateX: px }, { translateY: py },
      { rotate: dRot }, { scale: sRatio },
      { translateX: -cx.value }, { translateY: -cy.value },
    ];
  });

  // Anonymous fail-safe: the silhouette lens must never reveal the face. If it's active but there's
  // no face (or no mesh) this frame, black the whole frame — live preview AND baked output.
  if (lens === ANON_LENS_KEY && (!landmarks || !landmarks.mesh) && width > 0 && height > 0) {
    return <Blackout />;
  }
  if (!def || !landmarks || width <= 0 || height <= 0) { return null; }
  const f = faceFrame(landmarks, width, height, frameAspect);
  poseRef.current = { cx: f.eyeMid.x, cy: f.eyeMid.y, rot: (f.rollDeg * Math.PI) / 180, scl: f.faceW };
  const Comp = def.Comp;
  const content = <Comp f={f} clock={clock} w={width} h={height} />;
  // Only ride the predicted transform once two poses exist (velocity needs a previous sample).
  const useInterp = interpolate && initRef.current;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        {useInterp ? <Group transform={poseDelta}>{content}</Group> : content}
      </Canvas>
    </View>
  );
}

// ─── Live overlay (isolated re-render) ───────────────────────────────────────
// The tracker delivers landmarks via an external store (see useFaceTracking). This component
// subscribes to it with useSyncExternalStore so ONLY it re-renders per frame — the host component
// (ReactionRecorder / StudioCapture) creates the tracker but never re-renders on landmark updates,
// which is what kept the whole camera/players/controls tree from re-rendering at the camera rate.
export function LiveFaceLens({
  subscribe, getLandmarks, lens, width, height, frameAspect, animate = true, fallback = null,
}: {
  subscribe: (cb: () => void) => () => void;
  getLandmarks: () => FaceLandmarks | null;
  lens?: string | null;
  width: number;
  height: number;
  frameAspect?: number;
  animate?: boolean;
  fallback?: FaceLandmarks | null;
}) {
  const live = useSyncExternalStore(subscribe, getLandmarks);
  return (
    <FaceLensOverlay
      lens={lens}
      landmarks={live ?? fallback}
      width={width}
      height={height}
      frameAspect={frameAspect}
      animate={animate}
      interpolate
    />
  );
}

// ─── Replay ──────────────────────────────────────────────────────────────────
// A recorded reaction stores its lens as { lensId + a per-frame landmark track } captured during
// recording. On playback we sample the track at the clip's current time and render the lens over the
// (raw) reaction video — so the selfie stays clean and the lens is editable/removable.
export function FaceLensReplay({
  track, timeSec, width, height, frameAspect,
}: { track?: FaceLensTrack | null; timeSec: number; width: number; height: number; frameAspect?: number }) {
  if (!track) { return null; }
  // Anonymous fail-safe: a silhouette track with no frames still blacks the frame so a raw face can't
  // slip through the bake.
  if (track.frames.length === 0) {
    return track.lensId === ANON_LENS_KEY && width > 0 && height > 0 ? <Blackout /> : null;
  }
  let i = Math.round(timeSec * track.fps);
  if (i < 0) { i = 0; }
  if (i >= track.frames.length) { i = track.frames.length - 1; }
  // Rebuild the sparse mesh for this frame (mesh lenses) from the compact quantized track.
  let landmarks = track.frames[i];
  const meshQ = track.meshFrames?.[i];
  if (landmarks && meshQ && track.meshIdx) {
    landmarks = { ...landmarks, mesh: dequantizeMesh(meshQ, track.meshIdx) };
  }
  return (
    <FaceLensOverlay
      lens={track.lensId}
      landmarks={landmarks}
      width={width}
      height={height}
      frameAspect={frameAspect ?? track.frameAspect}
    />
  );
}
