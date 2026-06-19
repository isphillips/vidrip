import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSharedValue } from 'react-native-reanimated';
import { ControlledClockProvider } from '../effectClock';
import EffectLayer from './EffectLayer';
import { isEmptyRecipe, type OverlayRecipe } from '../effectRecipe';
import { FaceLensReplay } from '../../lens/faceLens';
import { ANON_LENS_KEY, ANON_FLOOR } from '../../lens/useAnonymousMode';
import { exportRecipe } from '../../../infrastructure/native/studioExporter';

export type BakeOpts = { sourceUri: string; recipe?: OverlayRecipe | null; durationSec: number; fps?: number; voiceMod?: 'deep' | null };
export type ShareBakerHandle = { bake: (opts: BakeOpts) => Promise<string> };

const MAX_FRAMES = 300;       // cap capture cost / disk for long clips
const STAGE_H = 640;          // capture height in points (×scale → ~1920px on @3x)

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

  useImperativeHandle(ref, () => ({
    bake: async ({ sourceUri, recipe, durationSec, fps = 30, voiceMod = null }) => {
      // No overlay AND no audio change → nothing to bake; the source already is the final video.
      if (isEmptyRecipe(recipe) && !voiceMod) { return sourceUri; }
      // Voice-only bake (e.g. anonymous mode with the silhouette somehow empty): process audio only.
      if (isEmptyRecipe(recipe)) {
        const { uri: vUri } = await exportRecipe({ clips: [{ uri: sourceUri }], colorMatrix: null, mirror: false, voiceMod });
        return vUri;
      }
      const r = recipe!;
      // Face-lens clips have no authoring canvas — match the stage to the recorded frame aspect
      // so the replayed lens maps 1:1 onto the source video (no crop/stretch).
      const aspect = r.faceLens?.frameAspect
        ? r.faceLens.frameAspect
        : (r.canvasW > 0 && r.canvasH > 0 ? r.canvasW / r.canvasH : 9 / 16);
      const h = STAGE_H;
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
      });
      return uri;
    },
  }), [clock]);

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
