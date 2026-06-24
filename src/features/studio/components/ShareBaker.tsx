import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View, Platform, Dimensions } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import RNFS from 'react-native-fs';
import { useSharedValue } from 'react-native-reanimated';
import { Canvas, useCanvasRef, ImageFormat } from '@shopify/react-native-skia';
import { ControlledClockProvider } from '../effectClock';
import EffectLayer from './EffectLayer';
import { isEmptyRecipe, type OverlayRecipe } from '../effectRecipe';
import {
  FaceLensReplay, getReactiveRenderer, sampleTrackMeshFrame,
  type FaceLensTrack, type MeshFrame, type ReactiveLensProps,
} from '../../lens/faceLens';
import { ANON_LENS_KEY, ANON_FLOOR } from '../../lens/useAnonymousMode';
import { exportRecipe } from '../../../infrastructure/native/studioExporter';

// Serialize a silhouette mesh track to a temp JSON file the native exporter reads (one file path over
// the bridge instead of a multi-MB array). Anchors are flattened per frame; mesh stays quantized.
async function writeSilhouetteTrack(track: FaceLensTrack): Promise<string> {
  const frames = track.frames.map((f) => (f
    ? [f.leftEye.x, f.leftEye.y, f.rightEye.x, f.rightEye.y, f.noseTip.x, f.noseTip.y, f.mouthCenter.x, f.mouthCenter.y, f.faceWidth]
    : null));
  const payload = { fps: track.fps, frameAspect: track.frameAspect ?? 0, meshIdx: track.meshIdx ?? [], frames, meshFrames: track.meshFrames ?? [] };
  const path = `${RNFS.CachesDirectoryPath}/anon_track_${Date.now()}.json`;
  await RNFS.writeFile(path, JSON.stringify(payload), 'utf8');
  return `file://${path}`;
}

export type BakeOpts = {
  sourceUri: string; recipe?: OverlayRecipe | null; durationSec: number; fps?: number; voiceMod?: 'deep' | null;
  // Branded attribution watermark (a full-frame transparent PNG from WatermarkStamper) composited on top
  // of the output. Only passed on OUTBOUND shares; absent for in-app channel/friend bakes.
  watermark?: { uri: string; width: number; height: number } | null;
};
export type ShareBakerHandle = { bake: (opts: BakeOpts) => Promise<string> };

const MAX_FRAMES = 300;       // cap capture cost / disk for long clips (view-shot path)
// The Skia-snapshot lens path is cheaper per frame, so it bakes true 30fps for longer clips before the
// cap kicks in (900 = 30s @ 30fps). Beyond that effFps eases down so processing time stays bounded.
// Tune against real on-device timing — higher = smoother long clips but longer processing.
const MAX_LENS_FRAMES = 900;
// The mesh track is now keyed to each frame's CAPTURE timestamp (see faceTracking), so the baked overlay
// already lands on the right frame — no latency to compensate. Left as a fine-tune for any small residual
// start-offset between the recording's first frame and the first tracked frame; 0 = no shift.
const LENS_BAKE_LEAD_MS = 0;
const STAGE_H = 640;          // capture height in points (×scale → ~1920px on @3x)
// Render the lens bake at the SAME logical height as the live preview (the window height). faceFrame
// maps the mesh with sy = canvasHeight, and the lens art (dot radius, glow, stroke widths) is in logical
// units — so matching the height makes the mesh map to identical coordinates and the lens look IDENTICAL
// to live. (A shorter stage shrank the face in logical space while the fixed-size dots/glow didn't,
// rendering the nodes wrong + lower-res.) Backing res follows dpr and supersamples onto the 720p source.
const lensStageH = () => Math.round(Dimensions.get('window').height);

const waitFrames = (n: number) =>
  new Promise<void>(res => {
    let c = 0;
    const tick = () => { if (++c >= n) { res(); } else { requestAnimationFrame(tick); } };
    requestAnimationFrame(tick);
  });

// Bakes a recipe's animated overlay into an MP4 for sharing OUT of the app. Because every
// effect is a pure function of the clock, we step the clock frame-by-frame, capture each
// frame deterministically, and hand the sequence to the native compositor — an exact copy of
// what plays in-app (no real-time recording, no loop seam). The source must already have the
// look (trim/colour/mirror) baked in; this only adds the overlay layer.
const ShareBaker = forwardRef<ShareBakerHandle>((_props, ref) => {
  const clock = useSharedValue(0);
  const stageRef = useRef<View>(null);
  const [job, setJob] = useState<{ recipe: OverlayRecipe; w: number; h: number } | null>(null);
  // The face-lens replay is a plain time-prop component (not clock-driven), so step it via state.
  const [bakeTime, setBakeTime] = useState(0);
  // Skia-snapshot lens bake: the lens renders into this Canvas (driven by `face` + `clock`), and each
  // frame is grabbed with makeImageSnapshot — no view-shot, deterministic clock, and uniform for every
  // reactive lens (no per-lens or native code).
  const canvasRef = useCanvasRef();
  const face = useSharedValue<MeshFrame | null>(null);
  const [lensJob, setLensJob] = useState<{ Comp: React.FC<ReactiveLensProps>; w: number; h: number } | null>(null);

  useImperativeHandle(ref, () => ({
    bake: async ({ sourceUri, recipe, durationSec, fps = 30, voiceMod = null, watermark = null }) => {
      // No overlay AND no audio change AND no watermark → nothing to bake; the source is the final video.
      if (isEmptyRecipe(recipe) && !voiceMod && !watermark) { return sourceUri; }
      // No overlay but a watermark and/or voice change → a single export pass stamps them onto the source.
      if (isEmptyRecipe(recipe)) {
        const { uri: vUri } = await exportRecipe({ clips: [{ uri: sourceUri }], colorMatrix: null, mirror: false, voiceMod, watermark });
        return vUri;
      }
      const r = recipe!;
      // iOS anonymous mode: composite the silhouette NATIVELY from the mesh track (no JS frame capture
      // → no jank). Android stays on the PNG-capture path below until its native compositor lands.
      if (Platform.OS === 'ios' && r.faceLens?.lensId === ANON_LENS_KEY && r.faceLens.meshFrames?.length) {
        const trackFile = await writeSilhouetteTrack(r.faceLens);
        const { uri } = await exportRecipe({ clips: [{ uri: sourceUri }], colorMatrix: null, mirror: false, voiceMod, silhouette: { trackFile }, watermark });
        return uri;
      }
      // Reactive lens → render its existing Skia renderer offscreen and snapshot each frame (fast,
      // deterministic, all lenses share this one path). Stage height = the live preview's height
      // (lensStageH) so the lens renders pixel-identical to live. The clock is stepped per frame so
      // clock-driven effects (motes/glow) bake at true video time.
      const ReactiveComp = getReactiveRenderer(r.faceLens?.lensId);
      if (r.faceLens && ReactiveComp) {
        const track = r.faceLens;
        const la = track.frameAspect && track.frameAspect > 0 ? track.frameAspect : 9 / 16;
        const lh = lensStageH();
        const lw = Math.round(lh * la);
        setLensJob({ Comp: ReactiveComp, w: lw, h: lh });
        await waitFrames(3); // mount the Canvas + let it lay out

        const ldur = Math.max(0.1, durationSec);
        const lCount = Math.min(MAX_LENS_FRAMES, Math.max(1, Math.ceil(ldur * fps)));
        const lFps = lCount / ldur;
        const lUris: string[] = [];
        for (let i = 0; i < lCount; i++) {
          const t = i / lFps;
          // Sample slightly AHEAD: the track is keyed to detection-ARRIVAL time, but the video frames are
          // at CAPTURE time, so without a lead the baked mesh trails the recorded face by the inference
          // latency. LENS_BAKE_LEAD_MS ≈ that latency (tune on-device; 0 disables).
          face.value = sampleTrackMeshFrame(track, Math.round((t + LENS_BAKE_LEAD_MS / 1000) * track.fps), lw, lh, la);
          clock.value = t;
          await waitFrames(2);          // let the UI thread recompute the mesh paths + repaint
          const img = canvasRef.current?.makeImageSnapshot();
          if (img) {
            const b64 = img.encodeToBase64(ImageFormat.PNG, 100);
            img.dispose();
            const fp = `${RNFS.CachesDirectoryPath}/lensbake_${i}.png`;
            await RNFS.writeFile(fp, b64, 'base64');
            lUris.push(`file://${fp}`);
          }
        }
        setLensJob(null);
        if (lUris.length === 0) { return sourceUri; }
        const { uri } = await exportRecipe({
          clips: [{ uri: sourceUri }],
          colorMatrix: null,
          mirror: false,
          overlayFrames: { uris: lUris, fps: lFps, overlap: 0, width: lw, height: lh },
          voiceMod,
          watermark,
        });
        // The native export has consumed the PNGs — clean them up so long clips don't pile up in cache.
        Promise.all(lUris.map(u => RNFS.unlink(u.replace(/^file:\/\//, '')).catch(() => {}))).catch(() => {});
        return uri;
      }

      // Face-lens clips have no authoring canvas — match the stage to the recorded frame aspect
      // so the replayed lens maps 1:1 onto the source video (no crop/stretch).
      const aspect = r.faceLens?.frameAspect
        ? r.faceLens.frameAspect
        : (r.canvasW > 0 && r.canvasH > 0 ? r.canvasW / r.canvasH : 9 / 16);
      // Lens bakes match the (720p) recording — no point rendering the overlay larger; the sticker/text
      // overlay bake keeps the full stage since its source can be a higher-res import.
      const h = r.faceLens ? lensStageH() : STAGE_H;
      const w = Math.round(h * aspect);

      // Mount the off-screen stage and let it lay out before stepping.
      setJob({ recipe: r, w, h });
      await waitFrames(3);

      const dur = Math.max(0.1, durationSec);
      const frameCount = Math.min(MAX_FRAMES, Math.max(1, Math.ceil(dur * fps)));
      const effFps = frameCount / dur; // real fps after capping → keeps motion at true speed

      const uris: string[] = [];
      for (let i = 0; i < frameCount; i++) {
        const t = i / effFps;
        clock.value = t;                // step the deterministic clock to this frame's time
        setBakeTime(t);                 // drive the face-lens replay to the same time
        await waitFrames(2);            // let the UI thread recompute the effects, then grab it
        const f = await captureRef(stageRef, { format: 'png', quality: 1, result: 'tmpfile' });
        uris.push(f.startsWith('file://') ? f : `file://${f}`);
      }
      setJob(null);

      const { uri } = await exportRecipe({
        clips: [{ uri: sourceUri }],
        colorMatrix: null,            // look already baked into the source
        mirror: false,
        overlayFrames: { uris, fps: effFps, overlap: 0, width: w, height: h },
        voiceMod,                     // anonymous mode pitch-shifts the audio on export
        watermark,
      });
      return uri;
    },
  }), [clock, face]);

  // Skia-snapshot lens stage: the reactive lens renders here; the bake loop steps `face`/`clock` and
  // grabs each frame via canvasRef.makeImageSnapshot(). Off-screen but laid out so the surface paints.
  if (lensJob) {
    const LensComp = lensJob.Comp;
    return (
      <Canvas
        ref={canvasRef}
        // eslint-disable-next-line react-native/no-inline-styles
        style={{ position: 'absolute', left: -100000, top: 0, width: lensJob.w, height: lensJob.h }}>
        <LensComp f={face} clock={clock} w={lensJob.w} h={lensJob.h} />
      </Canvas>
    );
  }

  if (!job) { return null; }
  // Rendered off-screen (still laid out, so captureRef works). Normally transparent so the PNG keeps
  // alpha for compositing over the video — EXCEPT for the anonymous silhouette, which uses an opaque
  // dark floor so a missed Skia paint can never leak the underlying face through a transparent frame.
  const anon = job.recipe.faceLens?.lensId === ANON_LENS_KEY;
  return (
    <View
      ref={stageRef}
      collapsable={false}
      pointerEvents="none"
      style={{ position: 'absolute', left: -100000, top: 0, width: job.w, height: job.h, backgroundColor: anon ? ANON_FLOOR : 'transparent' }}>
      <ControlledClockProvider clock={clock}>
        <EffectLayer recipe={job.recipe} width={job.w} height={job.h} />
      </ControlledClockProvider>
      {job.recipe.faceLens && (
        <FaceLensReplay track={job.recipe.faceLens} timeSec={bakeTime} width={job.w} height={job.h} />
      )}
    </View>
  );
});

export default ShareBaker;
