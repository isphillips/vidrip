import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import { faceFrame, meshFrameFor, useLensClock, dequantizeMesh, type FaceLandmarks, type FaceLensTrack, type MeshFrame, type ReactiveLensProps } from './core';
import { lensByKey } from './lenses';
import { StarMapRx } from './lenses/starMapRx';
import { CyberMeshRx } from './lenses/cyberMeshRx';
import { CircuitRx } from './lenses/circuitRx';
import { NebulaRx } from './lenses/nebulaRx';
import { PixelRx } from './lenses/pixelRx';
import { WebRx } from './lenses/webRx';
import { GildedRx } from './lenses/gildedRx';
import { OverdriveRx } from './lenses/overdriveRx';
import { MeltRx, DrippyRx } from './lenses/meltRx';
import { BlobSpewRx } from './lenses/blobSpewRx';
import { ANON_LENS_KEY } from './useAnonymousMode';

// Lenses migrated to the reactive (UI-thread, no-React-re-render) renderer. When the active lens is in
// here, LiveFaceLens drives it through ReactiveLensHost instead of the per-frame-reconcile path. The
// catalog still maps the key to the legacy Comp, which replay/bake (FaceLensReplay) continue to use.
const REACTIVE_RENDERERS: Record<string, React.FC<ReactiveLensProps>> = {
  starmap: StarMapRx,
  cyber: CyberMeshRx,
  circuit: CircuitRx,
  nebula: NebulaRx,
  pixel: PixelRx,
  web: WebRx,
  gilded: GildedRx,
  overdrive: OverdriveRx,
  melt: MeltRx,
  drippy: DrippyRx,
  blobstorm: BlobSpewRx,
};

// Bake helpers (used by ShareBaker's Skia-snapshot lens bake). Any lens registered in
// REACTIVE_RENDERERS is baked natively-via-Skia by the shared snapshot path — no per-lens bake code.
export function getReactiveRenderer(lensId?: string | null): React.FC<ReactiveLensProps> | undefined {
  return lensId ? REACTIVE_RENDERERS[lensId] : undefined;
}
// Sample the captured track into a MeshFrame for frame `i` (rebuilding the sparse mesh first). The bake
// loop sets this into the lens's `f` SharedValue, exactly like the live ReactiveLensHost does.
export function sampleTrackMeshFrame(track: FaceLensTrack, i: number, width: number, height: number, frameAspect?: number): MeshFrame | null {
  const n = track.frames.length;
  const idx = i < 0 ? 0 : i >= n ? n - 1 : i;
  let landmarks = track.frames[idx];
  const meshQ = track.meshFrames?.[idx];
  if (landmarks && meshQ && track.meshIdx) {
    landmarks = { ...landmarks, mesh: dequantizeMesh(meshQ, track.meshIdx) };
  }
  return landmarks ? meshFrameFor(landmarks, width, height, frameAspect ?? track.frameAspect) : null;
}

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

export type { Pt, FaceLandmarks, FaceFrame, Lens, LensProps, FaceLensTrack, MeshFrame, ReactiveLensProps } from './core';
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
  if (!Comp) { return null; }  // reactive lenses render via their *Rx (REACTIVE_RENDERERS), never here
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
type LiveProps = {
  lens?: string | null;
  subscribe: (fn: (lm: FaceLandmarks | null) => void) => () => void;
  width: number; height: number; frameAspect?: number; fallback?: FaceLandmarks | null;
  // Optional per-frame expression tap (smile/browRaise/mouthOpen) for analytics — see ReactionRecorder's
  // peak accumulator. Only the reactive (mesh) host fires it, which is also the only path that produces
  // smile/browRaise; mesh-less lenses have no expression signal to report.
  onFrameMetrics?: (mf: MeshFrame | null) => void;
};

// Selector: reactive lenses (mesh, UI-thread render) go through ReactiveLensHost; everything else uses
// the legacy per-frame-state host. No hooks here so the branch is safe across lens changes.
export function LiveFaceLens(props: LiveProps) {
  const ReactiveComp = props.lens ? REACTIVE_RENDERERS[props.lens] : undefined;
  return ReactiveComp
    ? <ReactiveLensHost ReactiveComp={ReactiveComp} subscribe={props.subscribe} width={props.width} height={props.height} frameAspect={props.frameAspect} onFrameMetrics={props.onFrameMetrics} />
    : <LegacyLensHost {...props} />;
}

// Legacy host: mirrors the subscribed landmarks into local React state and renders the lens through
// FaceLensOverlay. Each face frame re-renders THIS small component (never the parent screen).
function LegacyLensHost({ lens, subscribe, width, height, frameAspect, fallback = null }: LiveProps) {
  const [landmarks, setLandmarks] = useState<FaceLandmarks | null>(fallback);
  useEffect(() => subscribe(setLandmarks), [subscribe]);
  // No native tracker (sim/demo): the subscription never fires, so seed/refresh the mock directly.
  useEffect(() => { if (fallback) { setLandmarks(fallback); } }, [fallback]);
  return (
    <FaceLensOverlay lens={lens} landmarks={landmarks} width={width} height={height} frameAspect={frameAspect} />
  );
}

// Reactive host: writes each frame's FaceFrame into a SharedValue (NO setState) and mounts the lens
// ONCE. The lens reads the SharedValue via useDerivedValue, so the per-frame mesh render runs on the UI
// thread with zero React reconciliation — the snappiest path, and leak-free (Reanimated runtime is GC'd).
function ReactiveLensHost({
  ReactiveComp, subscribe, width, height, frameAspect, onFrameMetrics,
}: {
  ReactiveComp: React.FC<ReactiveLensProps>;
  subscribe: (fn: (lm: FaceLandmarks | null) => void) => () => void;
  width: number; height: number; frameAspect?: number;
  onFrameMetrics?: (mf: MeshFrame | null) => void;
}) {
  const face = useSharedValue<MeshFrame | null>(null);
  // meshFrameFor needs the box dims; keep them in a ref so the subscriber always reads the latest.
  const dims = useRef({ w: width, h: height, a: frameAspect });
  dims.current = { w: width, h: height, a: frameAspect };
  const clock = useLensClock(true);
  // Keep onFrameMetrics in a ref so the subscription (set up once) always calls the latest callback.
  const metricsCb = useRef(onFrameMetrics);
  metricsCb.current = onFrameMetrics;
  useEffect(() => subscribe((lm) => {
    const mf = lm ? meshFrameFor(lm, dims.current.w, dims.current.h, dims.current.a) : null;
    face.value = mf;
    // This callback already runs on JS once per frame (meshFrameFor is JS); the tap is a few Math.max.
    metricsCb.current?.(mf);
  }), [subscribe, face]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <ReactiveComp f={face} clock={clock} w={width} h={height} />
      </Canvas>
    </View>
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
  // Converted lenses: replay through the SAME reactive renderer the camera preview uses, so the baked
  // output matches the live look exactly (one renderer — no legacy-vs-reactive divergence).
  const ReactiveComp = track.lensId ? REACTIVE_RENDERERS[track.lensId] : undefined;
  if (ReactiveComp) {
    return (
      <ReactiveReplay
        ReactiveComp={ReactiveComp}
        landmarks={landmarks}
        width={width}
        height={height}
        frameAspect={frameAspect ?? track.frameAspect}
      />
    );
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

// Drives a converted lens's reactive *Rx renderer from a sampled track frame, by pushing it into a
// SharedValue<MeshFrame> (computed once per frame via useMemo). Used by the bake + replay so the output
// is pixel-identical to the live camera. The bake's capture loop already proves UI-thread-driven Skia is
// snapshotted correctly here (EffectLayer renders the same way). The SV is set in render so it's ready
// before the bake's capture wait; the assignment is idempotent.
function ReactiveReplay({
  ReactiveComp, landmarks, width, height, frameAspect,
}: {
  ReactiveComp: React.FC<ReactiveLensProps>;
  landmarks: FaceLandmarks | null;
  width: number; height: number; frameAspect?: number;
}) {
  const face = useSharedValue<MeshFrame | null>(null);
  const mf = useMemo(
    () => (landmarks ? meshFrameFor(landmarks, width, height, frameAspect) : null),
    [landmarks, width, height, frameAspect],
  );
  face.value = mf;
  const clock = useLensClock(true);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <ReactiveComp f={face} clock={clock} w={width} h={height} />
      </Canvas>
    </View>
  );
}
