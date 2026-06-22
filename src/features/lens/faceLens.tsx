import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { faceFrame, useLensClock, dequantizeMesh, type FaceLandmarks, type FaceLensTrack } from './core';
import { lensByKey } from './lenses';
import { ANON_LENS_KEY } from './useAnonymousMode';

// SPIKE: pick this lens in the picker to A/B the UI-thread pipeline. It renders via a Skia frame
// processor (useSpikeFrameProcessor) that draws straight on the camera frame — NOT through this
// overlay — so FaceLensOverlay intentionally does nothing for it (the capture screen gates it out).
export const SPIKE_KEY = 'spike';

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
export default function FaceLensOverlay({
  lens, landmarks, width, height, frameAspect, animate = true,
}: { lens?: string | null; landmarks?: FaceLandmarks | null; width: number; height: number; frameAspect?: number; animate?: boolean }) {
  const def = lensByKey(lens);
  const show = !!def && !!landmarks && width > 0 && height > 0;
  const clock = useLensClock(animate && show);
  // Anonymous fail-safe: the silhouette lens must never reveal the face. If it's active but there's
  // no face (or no mesh) this frame, black the whole frame — live preview AND baked output.
  if (lens === ANON_LENS_KEY && (!landmarks || !landmarks.mesh) && width > 0 && height > 0) {
    return <Blackout />;
  }
  if (!def || !landmarks || width <= 0 || height <= 0) { return null; }
  const f = faceFrame(landmarks, width, height, frameAspect);
  const Comp = def.Comp;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Comp f={f} clock={clock} w={width} h={height} />
      </Canvas>
    </View>
  );
}

// ─── Live overlay ──────────────────────────────────────────────────────────────
// The live camera surface. Subscribes to the tracker's per-frame landmarks (see useFaceTracking) and
// keeps them in LOCAL state, so ONLY this small component re-renders each frame — never the parent
// capture/reaction screen, which mounts the camera, source players and lens picker (re-rendering that
// tree 30×/sec was the main source of lens lag). `fallback` seeds a mock face on builds with no native
// tracker (simulator/demo) so the lens still shows over a still frame.
export function LiveFaceLens({
  lens, subscribe, width, height, frameAspect, fallback = null,
}: {
  lens?: string | null;
  subscribe: (fn: (lm: FaceLandmarks | null) => void) => () => void;
  width: number; height: number; frameAspect?: number; fallback?: FaceLandmarks | null;
}) {
  const [landmarks, setLandmarks] = useState<FaceLandmarks | null>(fallback);
  useEffect(() => subscribe(setLandmarks), [subscribe]);
  // No native tracker (sim/demo): the subscription never fires, so seed/refresh the mock directly.
  useEffect(() => { if (fallback) { setLandmarks(fallback); } }, [fallback]);
  return (
    <FaceLensOverlay lens={lens} landmarks={landmarks} width={width} height={height} frameAspect={frameAspect} />
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
