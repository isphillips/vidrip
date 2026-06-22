import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, Alert, StatusBar, useWindowDimensions, Animated, InteractionManager,
} from 'react-native';
import Orientation from 'react-native-orientation-locker';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import TikTokPlayer, { type TikTokPlayerHandle } from '../../../components/TikTokPlayer';
import InstagramPlayer, { type InstagramPlayerHandle } from '../../../components/InstagramPlayer';
import { WebView } from 'react-native-webview';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useMicrophonePermission,
  type VideoFile,
} from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { IG_BLOCK_LAUNCH_JS } from '../../shared/igBlockLaunch';
import { IG_REEL_JS, TapToPlayHint } from '../../shared/igReelPlayer';
import {
  checkHeadphonesConnected,
  restoreAudioRoute,
} from '../../../infrastructure/native/audioRecorder';
import BunnyVideoLayer from '../../studio/components/BunnyVideoLayer';
import DraggablePip from './DraggablePip';
import type { OverlayRecipe } from '../../studio/effectRecipe';
import { faceLensRecipe } from '../../studio/effectRecipe';
import FaceLensOverlay, { lensByKey, type FaceLensTrack } from '../../lens/faceLens';
import LensPicker from '../../lens/LensPicker';
import { MOCK_FACE } from '../../lens/useFaceLandmarks';
import { useFaceTracking, faceTrackingAvailable } from '../../lens/faceTracking';
import { useAnonymousMode, ANON_LENS_KEY, ANON_VOICE_MOD } from '../../lens/useAnonymousMode';
import { useUploadStore } from '../../../store/uploadStore';
import { useBakeQueueStore } from '../../../store/bakeQueueStore';
import { DEMO_MODE } from '../../../demo/demoMode';

// DEMO/screenshot only: the simulator has no camera, so we paint this still "selfie"
// where the live preview would be, letting the lens picker be screenshotted over a
// realistic frame. Remove with the rest of DEMO_MODE before production.
const DEMO_CAM = require('../../../demo/reactor-f.png');
// DEMO/screenshot only: the "video being reacted to" — sim players render black, so we
// paint this behind the PIP selfie. Remove with the rest of DEMO_MODE before production.
const DEMO_MAIN = require('../../../demo/prod.png');


function FloatingEmoji({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  const dir = useRef(Math.random() > 0.5 ? 1 : -1).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }).start(onDone);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -220] });
  const translateX = anim.interpolate({
    inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
    outputRange: [0, dir * 28, dir * -22, dir * 30, dir * -18, dir * 12],
  });
  const opacity = anim.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1, 1, 0] });
  const scale   = anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.5, 1.2, 1] });
  return (
    <Animated.Text style={[floatStyles.emoji, { transform: [{ translateY }, { translateX }, { scale }], opacity }]}>
      {emoji}
    </Animated.Text>
  );
}
const floatStyles = StyleSheet.create({
  emoji: { position: 'absolute', bottom: 120, alignSelf: 'center', fontSize: 36 },
});

export interface ReactionRecorderProps {
  videoId?: string;
  // Instagram has no embed player — its source plays from this re-hosted file URL.
  sourceUri?: string;
  // Creator (Bunny) videos play from a signed iframe embed URL (token-authed).
  embedUrl?: string;
  // Animated overlay layer for a creator (Bunny) video — replayed live over the embed.
  recipe?: OverlayRecipe | null;
  sourceType?: 'youtube' | 'tiktok' | 'instagram' | 'bunny' | 'studio' | 'facebook';
  onSave: (filePath: string, duration: number, ytStartOffset: number, recordedWithHeadphones: boolean, lensTrack?: FaceLensTrack | null, afterthought?: { path: string; duration: number } | null) => Promise<void>;
  onBack: () => void;
  uploadingText?: string;
  /** Hard cap in seconds — recording auto-stops when reached (e.g. 60s reviews). */
  maxDuration?: number;
  /** After the main reaction stops, offer a 5s window to record an "afterthought" outro
   *  that plays after the video for the viewer (friend-share reactions). */
  allowAfterthought?: boolean;
}

const AFTERTHOUGHT_MAX = 30;       // seconds
const AFTERTHOUGHT_COUNTDOWN = 5;  // decision window after the reaction finishes

const YT_PARAMS = { rel: false as const, controls: true as const };
const YT_WV_STYLE = { backgroundColor: '#000000' };
const PIP_W = 110;
const PIP_H = 155;

export default function ReactionRecorder({
  videoId,
  sourceUri,
  embedUrl,
  recipe,
  sourceType = 'youtube',
  onSave,
  onBack,
  uploadingText = 'Saving…',
  maxDuration,
  allowAfterthought = false,
}: ReactionRecorderProps) {
  const { width, height } = useWindowDimensions();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();

  // With a source video (feed / channel-post reactions) the source's own play /
  // pause / end drives recording — no manual buttons. Without one (private channel
  // clips, reviews) the user records with the manual controls.
  // Creator (Bunny) source — token-authed iframe embed. Its play/pause is now bridged out
  // (BunnyVideoLayer), so it drives recording like the other sources.
  const bunnyEmbed = sourceType === 'bunny' && !!embedUrl;
  // Instagram + Facebook creator reels and Studio clips shared to friends are all
  // re-hosted MP4 files, played identically via react-native-video (the "InstagramPlayer"
  // file player) from sourceUri.
  const fileSource = (sourceType === 'instagram' || sourceType === 'facebook' || sourceType === 'studio') && !!sourceUri;
  const sourceDriven = !!videoId || fileSource || bunnyEmbed;
  // Instagram thread shortcode — WebView embed has no controllable player, so the
  // user starts/stops recording manually while watching the reel.
  const igWebEmbed = sourceType === 'instagram' && !!videoId && !sourceUri;
  // Camera shows as a PIP corner whenever a source video fills the screen behind it.
  const pipCamera = sourceDriven;

  const device = useCameraDevice('front');
  // Cap the reaction to 720p/30fps so files stay under the 50MB storage upload
  // limit (uncapped, the front camera records at its max and clips exceed 50MB,
  // failing the relay upload so recipients can't watch). Clamp fps to what the
  // chosen format supports — fps outside the format's range throws.
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1280, height: 720 } },
    { fps: 30 },
  ]);
  const targetFps = format ? Math.min(30, format.maxFps) : 30;
  const { hasPermission: hasCam, requestPermission: requestCam } = useCameraPermission();
  const { hasPermission: hasMic, requestPermission: requestMic } = useMicrophonePermission();

  const [ready, setReady] = useState(false);
  // Start the camera session AFTER the screen-open transition so it doesn't freeze the
  // navigation animation (starting capture is heavy).
  const [camActive, setCamActive] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setCamActive(true));
    return () => task.cancel();
  }, []);
  // AR face lens for the reaction (null = none). Replayed/baked the same as the studio.
  const [lensKey, setLensKey] = useState<string | null>(null);
  // React Anonymously: force the silhouette lens (overriding any pick), hide the picker, and bake the
  // silhouette + deep voice into the reaction (and afterthought) so the raw face/voice never ship.
  const anon = useAnonymousMode();
  const effLensKey = anon ? ANON_LENS_KEY : lensKey;
  // Request the full 478-pt mesh only when the active lens is a mesh lens (so its track captures the
  // mesh for replay). Inert while effLensKey is null.
  const { frameProcessor, landmarks: liveLandmarks, startTrack, stopTrack, cancelTrack } = useFaceTracking(true, !!lensByKey(effLensKey)?.mesh);
  const lensLandmarks = liveLandmarks ?? (effLensKey && !faceTrackingAvailable ? MOCK_FACE : null);
  // Camera-frame aspect (w/h) — shared by the live overlay and the captured track so replay
  // cover-crops the same way the preview did.
  const frameAspect = format ? Math.min(format.videoWidth, format.videoHeight) / Math.max(format.videoWidth, format.videoHeight) : 9 / 16;
  // Latest captured lens track, set on stop and handed to onSave.
  const lensTrackRef = useRef<FaceLensTrack | null>(null);
  const lensKeyRef = useRef<string | null>(null);
  useEffect(() => { lensKeyRef.current = effLensKey; }, [effLensKey]);
  // Captured lens track for the afterthought clip (anonymous mode bakes it too).
  const afterTrackRef = useRef<FaceLensTrack | null>(null);
  // Anonymous mode hands the heavy silhouette + voice bake to the global background baker (so the
  // recorder returns to the thread immediately, with a toast — like a normal reaction save).
  const enqueueUpload = useUploadStore((s) => s.enqueue);
  const showUpload = useUploadStore((s) => s.show);
  const dismissUpload = useUploadStore((s) => s.dismiss);
  const requestBake = useBakeQueueStore((s) => s.requestBake);
  const [ytPlaying, setYtPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [speakerToast, setSpeakerToast] = useState(false);
  const [floating, setFloating] = useState<{ id: number; emoji: string }[]>([]);

  const ytRef = useRef<YoutubeIframeRef>(null);
  const ttRef = useRef<TikTokPlayerHandle>(null);
  const igRef = useRef<InstagramPlayerHandle>(null);
  const cameraRef = useRef<Camera>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const hasStartedRef = useRef(false);
  const skipNextPausedRef = useRef(false);
  const ytKeyRef = useRef(0);
  const ytStartOffsetRef = useRef(0);
  const recordingCallbackRef = useRef<((v: VideoFile) => void) | null>(null);
  // Reject the pending stop-promise when the camera errors, so the real failure surfaces
  // immediately instead of swallowing it and falling through to the 15s "timed out".
  const recordingRejectRef = useRef<((e: any) => void) | null>(null);
  const speakerOverrideRef = useRef(false);
  // Whether headphones were connected at record time. Headphones → the source plays
  // in the ears, so the mic captures voice ONLY → play the live source on playback.
  // No headphones → mic captures the speaker (bleed) → mute the live source instead.
  const recordedWithHeadphonesRef = useRef(false);
  const handleStopRef = useRef<() => void>(() => {});
  // Receding cap bar (1 = full → 0 = time's up) when there's a hard duration limit.
  const capAnim = useRef(new Animated.Value(1)).current;
  const [ytKey, setYtKey] = useState(0);
  // IG reels are tap-to-play; hide the hint + know playback began once 'playing' fires.
  const [igStarted, setIgStarted] = useState(false);

  // Afterthought outro: after the main reaction stops, a short window to optionally record a
  // selfie clip that plays after the video for the viewer. 'none' = normal flow.
  const [afterPhase, setAfterPhase] = useState<'none' | 'countdown' | 'recording'>('none');
  const [countdown, setCountdown] = useState(AFTERTHOUGHT_COUNTDOWN);
  const [afterElapsed, setAfterElapsed] = useState(0);
  const mainVideoRef = useRef<{ path: string; duration: number; ytStartOffset: number; headphones: boolean; lensTrack: FaceLensTrack | null } | null>(null);
  const afterCallbackRef = useRef<((v: VideoFile) => void) | null>(null);
  const afterElapsedRef = useRef(0);
  const afterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalizeRef = useRef<(a: { path: string; duration: number } | null) => void>(() => {});
  const stopAfterthoughtRef = useRef<() => void>(() => {});

  useEffect(() => {
    Orientation.lockToPortrait();
    return () => {
      Orientation.unlockAllOrientations();
      if (timerRef.current) { clearInterval(timerRef.current); }
      if (speakerOverrideRef.current) { restoreAudioRoute().catch(() => {}); }
    };
  }, []);

  useEffect(() => {
    (async () => {
      const cam = hasCam || (await requestCam());
      const mic = hasMic || (await requestMic());
      setReady(cam && mic);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); }
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (maxDuration && elapsedRef.current >= maxDuration) {
        handleStopRef.current();   // hard cap reached → finish automatically
      }
    }, 1000);
  }, [maxDuration]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const beginRecording = useCallback(async () => {
    if (hasStartedRef.current) { return; }
    hasStartedRef.current = true;
    ytStartOffsetRef.current = 0;
    // Begin capturing the face-lens track (per-frame landmarks) if a lens is on.
    if (lensKeyRef.current) { startTrack(lensKeyRef.current, frameAspect); }

    // Detect headphones to decide the playback audio model (see ref comment). With
    // headphones we leave the source in the ears so the mic captures voice only;
    // without, we let it play out the speaker (captured as bleed) and nudge the user
    // toward headphones for cleaner separation.
    try {
      const headphones = await checkHeadphonesConnected();
      recordedWithHeadphonesRef.current = headphones;
      if (!headphones) {
        setSpeakerToast(true);
        setTimeout(() => setSpeakerToast(false), 3000);
      }
    } catch { recordedWithHeadphonesRef.current = false; }

    cameraRef.current?.startRecording({
      fileType: 'mp4',
      onRecordingFinished: (video) => { recordingCallbackRef.current?.(video); recordingCallbackRef.current = null; recordingRejectRef.current = null; },
      onRecordingError: (error: any) => {
        const msg = `${error?.code ?? 'error'}: ${error?.message ?? String(error)}`;
        // Reject the pending stop-promise (if any) so handleStop surfaces the real error
        // immediately instead of waiting out the 15s timeout.
        recordingRejectRef.current?.(error instanceof Error ? error : new Error(msg));
        recordingCallbackRef.current = null;
        recordingRejectRef.current = null;
        setIsRecording(false); stopTimer(); StatusBar.setHidden(false, 'fade');
      },
    });

    setIsRecording(true);
    StatusBar.setHidden(true, 'fade');
    startTimer();
    if (maxDuration) {
      capAnim.setValue(1);
      Animated.timing(capAnim, { toValue: 0, duration: maxDuration * 1000, useNativeDriver: false }).start();
    }
  }, [startTimer, stopTimer, maxDuration, capAnim, startTrack, frameAspect]);

  // Commit the captured main reaction (+ optional afterthought) and exit. The save itself is
  // fast (DB row + local copy); the slow upload runs in the background via the upload store.
  const finalize = useCallback(async (afterthought: { path: string; duration: number } | null) => {
    const m = mainVideoRef.current;
    if (!m) { onBack(); return; }
    setAfterPhase('none');

    if (anon) {
      // Anonymous mode: the silhouette + deep voice must be baked into the file(s) before they're
      // saved/uploaded (the raw face/voice must never leave the device). The bake is slow, so it runs
      // in the global background baker and we leave immediately. ONE toast progression: a "Preparing…"
      // toast during the bake, dismissed the instant before onSave shows the real "Saving…" toast — so
      // there's never an overlapping/premature "saved". Bake at 15fps (the silhouette track is 15fps)
      // to halve the work and keep the rest of the app responsive while it runs.
      const mainTrack = m.lensTrack, afterTrack = afterTrackRef.current, afterRaw = afterthought;
      const dur = m.duration, ytOff = m.ytStartOffset, hp = m.headphones, rawMain = m.path;
      const prepId = showUpload('Preparing video…');
      (async () => {
        try {
          const bakedMain = await requestBake({ sourceUri: rawMain, recipe: mainTrack ? faceLensRecipe(mainTrack) : null, durationSec: dur, voiceMod: ANON_VOICE_MOD, fps: 15 });
          let after = afterRaw;
          if (afterRaw) {
            const bakedAfter = await requestBake({ sourceUri: afterRaw.path, recipe: afterTrack ? faceLensRecipe(afterTrack) : null, durationSec: afterRaw.duration, voiceMod: ANON_VOICE_MOD, fps: 15 });
            after = { ...afterRaw, path: bakedAfter };
          }
          dismissUpload(prepId);                                   // hand off cleanly to the save toast
          await onSave(bakedMain, dur, ytOff, hp, null, after);    // shows the real "Saving…" toast
        } catch (e) {
          dismissUpload(prepId);
          enqueueUpload(uploadingText || 'Saving reaction…', async () => { throw e instanceof Error ? e : new Error('Could not anonymize the reaction'); });
        }
      })();
      onBack();
      return;
    }

    setUploading(true);
    try {
      await onSave(m.path, m.duration, m.ytStartOffset, m.headphones, m.lensTrack, afterthought);
      onBack();
    } catch (e: any) {
      Alert.alert('Could Not Save', e?.message ?? 'Something went wrong. Please try again.');
      setUploading(false);
    }
  }, [onSave, onBack, anon, enqueueUpload, showUpload, dismissUpload, requestBake, uploadingText]);
  useEffect(() => { finalizeRef.current = finalize; }, [finalize]);

  const handleStop = useCallback(async () => {
    // Re-entry guard (synchronous, since isRecording state is async): a source video that
    // ends fires BOTH 'ended' and 'paused' (and the Bunny bridge polls paused), which would
    // call handleStop twice — the first finalizes & uploads, the second has no active
    // recording and times out ("Recording timed out"). hasStartedRef flips off here so
    // onYtStateChange's later 'paused'/'ended' can't re-trigger a stop.
    if (!isRecording || !hasStartedRef.current) { return; }
    hasStartedRef.current = false;
    stopTimer();
    capAnim.stopAnimation();
    setIsRecording(false);
    StatusBar.setHidden(false, 'fade');
    // Finalize the captured lens track (null when no lens was on / no face seen).
    lensTrackRef.current = lensKeyRef.current ? stopTrack() : null;

    if (speakerOverrideRef.current) { restoreAudioRoute().catch(() => {}); speakerOverrideRef.current = false; }

    try {
      const video = await Promise.race([
        new Promise<VideoFile>((resolve, reject) => {
          recordingCallbackRef.current = resolve;
          recordingRejectRef.current = reject;
          cameraRef.current?.stopRecording().catch(reject);
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Recording timed out — please try again.')), 15000)
        ),
      ]);
      mainVideoRef.current = {
        path: video.path,
        duration: elapsedRef.current,
        ytStartOffset: ytStartOffsetRef.current,
        headphones: recordedWithHeadphonesRef.current,
        lensTrack: lensTrackRef.current,
      };
      // Friend-share path: offer the afterthought window. Otherwise save straight away.
      if (allowAfterthought) {
        setCountdown(AFTERTHOUGHT_COUNTDOWN);
        setAfterPhase('countdown');
      } else {
        await finalize(null);
      }
    } catch (e: any) {
      Alert.alert('Could Not Save', e?.message ?? 'Something went wrong. Please try again.');
      setUploading(false);
    }
  }, [isRecording, stopTimer, capAnim, stopTrack, allowAfterthought, finalize]);

  // Afterthought decision countdown — auto-sends (no outro) when it hits zero.
  useEffect(() => {
    if (afterPhase !== 'countdown') { return; }
    const iv = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(iv); finalizeRef.current(null); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [afterPhase]);

  const startAfterthought = useCallback(() => {
    afterElapsedRef.current = 0;
    setAfterElapsed(0);
    setAfterPhase('recording');
    StatusBar.setHidden(true, 'fade');
    cameraRef.current?.startRecording({
      fileType: 'mp4',
      onRecordingFinished: (v) => { afterCallbackRef.current?.(v); afterCallbackRef.current = null; },
      onRecordingError: () => { afterCallbackRef.current = null; finalizeRef.current(null); },
    });
    // Anonymous mode: track the afterthought too so its silhouette can be baked in.
    if (anon) { startTrack(ANON_LENS_KEY, frameAspect); }
    if (afterTimerRef.current) { clearInterval(afterTimerRef.current); }
    afterTimerRef.current = setInterval(() => {
      afterElapsedRef.current += 1;
      setAfterElapsed(afterElapsedRef.current);
      if (afterElapsedRef.current >= AFTERTHOUGHT_MAX) { stopAfterthoughtRef.current(); }
    }, 1000);
  }, [anon, startTrack, frameAspect]);

  const stopAfterthought = useCallback(async () => {
    if (afterTimerRef.current) { clearInterval(afterTimerRef.current); afterTimerRef.current = null; }
    StatusBar.setHidden(false, 'fade');
    // Finalize the afterthought's lens track (anonymous mode) before we capture the file.
    afterTrackRef.current = anon ? stopTrack() : null;
    try {
      const v = await Promise.race([
        new Promise<VideoFile>((resolve, reject) => {
          afterCallbackRef.current = resolve;
          cameraRef.current?.stopRecording().catch(reject);
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ]);
      await finalize({ path: v.path, duration: Math.max(1, afterElapsedRef.current) });
    } catch {
      await finalize(null);   // afterthought failed → send the reaction without it
    }
  }, [finalize, anon, stopTrack]);
  useEffect(() => { stopAfterthoughtRef.current = stopAfterthought; }, [stopAfterthought]);

  // Keep the timer's auto-stop pointed at the current handleStop.
  useEffect(() => { handleStopRef.current = handleStop; }, [handleStop]);

  // Exit without saving — discards the in-progress recording.
  const handleExit = useCallback(async () => {
    if (isRecording) {
      stopTimer();
      capAnim.stopAnimation();
      setIsRecording(false);
      StatusBar.setHidden(false, 'fade');
      if (speakerOverrideRef.current) { restoreAudioRoute().catch(() => {}); speakerOverrideRef.current = false; }
      recordingCallbackRef.current = null;   // drop the result → discard
      cancelTrack();
      await cameraRef.current?.stopRecording().catch(() => {});
    }
    onBack();
  }, [isRecording, stopTimer, onBack, capAnim, cancelTrack]);

  const handleRestart = useCallback(async () => {
    stopTimer();
    capAnim.stopAnimation();
    capAnim.setValue(1);
    elapsedRef.current = 0;
    setElapsed(0);
    hasStartedRef.current = false;
    setIsRecording(false);
    setYtPlaying(false);
    StatusBar.setHidden(false, 'fade');
    if (speakerOverrideRef.current) { restoreAudioRoute().catch(() => {}); speakerOverrideRef.current = false; }
    cancelTrack();         // discard the in-progress lens capture; next start re-begins it
    await cameraRef.current?.stopRecording().catch(() => {});
    setIgStarted(false);   // reel remounts → show tap-to-play again
    ytKeyRef.current += 1;
    setYtKey(ytKeyRef.current);
  }, [stopTimer, cancelTrack, capAnim]);

  const onYtStateChange = useCallback((state: string) => {
    if (state === 'playing') {
      skipNextPausedRef.current = true;
      setYtPlaying(true);
      beginRecording();
    } else if (state === 'paused') {
      setYtPlaying(false);
      // Source drives the reaction: a genuine pause finishes & saves it. The first
      // paused event right after play is spurious (buffering fires 'buffering', not
      // 'paused', so this is safe), so skip it once.
      if (skipNextPausedRef.current) {
        skipNextPausedRef.current = false;
      } else if (hasStartedRef.current) {
        handleStopRef.current();
      }
    } else if (state === 'ended') {
      setYtPlaying(false);
      skipNextPausedRef.current = false;
      if (hasStartedRef.current) { handleStopRef.current(); }
    }
  }, [beginRecording]);

  // TikTok has no `play` prop — push ytPlaying into the player.
  useEffect(() => {
    if (sourceType !== 'tiktok') { return; }
    if (ytPlaying) { ttRef.current?.play(); } else { ttRef.current?.pause(); }
  }, [ytPlaying, sourceType]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // In __DEV__ (iOS Simulator has no camera device) fall through so the source
  // player + recording controls (Stop/Restart/Exit) are still testable.
  if ((!ready || !device) && !__DEV__) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoText}>Camera and microphone access required</Text>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // PIP placement: starts on the LEFT (item 1 — third-party icons sit on the right of IG/TikTok),
  // and is draggable within `pipBounds` (item 4). For IG/TikTok keep a right-edge strip clear so
  // the PIP can't cover the platform's like/comment/share icons.
  const isVerticalSource = sourceType === 'instagram' || sourceType === 'tiktok' || sourceType === 'studio';
  const RIGHT_ICON_STRIP = isVerticalSource ? 64 : SPACE.LG;
  const pipBounds = {
    minX: SPACE.LG,
    maxX: Math.max(SPACE.LG, width - PIP_W - RIGHT_ICON_STRIP),
    minY: topInset + SPACE.SM,
    maxY: Math.max(topInset + SPACE.SM, height - bottomInset - PIP_H - SPACE.SM),
  };
  const pipStart = { x: SPACE.LG, y: Math.max(pipBounds.minY, height - bottomInset - 100 - PIP_H) };
  // During the afterthought the source video is gone, so the camera goes full-screen.
  const camAsPip = pipCamera && afterPhase === 'none';

  // Compliance letterbox margins for IG/TikTok sources (item 3) — inset the vertical player with
  // top/bottom black bars instead of full-bleed. YouTube is unchanged.
  const letterTop = topInset + 56;
  const letterBottom = bottomInset + 88;
  const letterH = Math.max(0, height - letterTop - letterBottom);

  return (
    <View style={styles.container}>
      {/* Source-video full-screen background (or black if no source / during afterthought) */}
      {afterPhase !== 'none' ? (
        <View style={styles.ytCover} />
      ) : __DEV__ && DEMO_MODE && pipCamera ? (
        // DEMO/screenshot: sim players render black, so paint the "reacted" video here.
        <View style={styles.ytCover}>
          <Image source={DEMO_MAIN} style={{ width, height }} resizeMode="contain" />
        </View>
      ) : bunnyEmbed ? (
        <View style={styles.ytCover}>
          {/* Signed embed + live overlay replay; play/pause drives recording (source-driven).
              No autoplay — the user's tap to play is what begins the recording. */}
          <BunnyVideoLayer
            embedUrl={embedUrl as string}
            recipe={recipe}
            onStateChange={onYtStateChange}
            autoplay={false}
          />
        </View>
      ) : fileSource ? (
        <View style={styles.ytCover}>
          <View style={[styles.sourceLetterbox, { top: letterTop, height: letterH }]}>
            <InstagramPlayer
              key={ytKey}
              ref={igRef}
              uri={sourceUri as string}
              style={{ width, height: letterH }}
              onChangeState={onYtStateChange}
            />
            {/* react-native-video has no built-in controls — tap to start (which begins recording). */}
            {!ytPlaying && (
              <TouchableOpacity
                style={[StyleSheet.absoluteFill, styles.igPlayOverlay]}
                activeOpacity={0.85}
                onPress={() => igRef.current?.play()}>
                <View style={styles.igPlayBtn}><Text style={styles.igPlayIcon}>▶</Text></View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : videoId && sourceType === 'tiktok' ? (
        <View style={styles.ytCover}>
          <View style={[styles.sourceLetterbox, { top: letterTop, height: letterH }]}>
            <TikTokPlayer
              key={ytKey}
              ref={ttRef}
              style={{ width, height: letterH, backgroundColor: '#000' }}
              videoId={videoId}
              onChangeState={onYtStateChange}
            />
          </View>
        </View>
      ) : videoId && sourceType === 'instagram' ? (
        <View style={styles.ytCover}>
          <View style={[styles.sourceLetterbox, { top: letterTop, height: letterH }]}>
          <WebView
            key={ytKey}
            style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}
            source={{ uri: `https://www.instagram.com/reel/${videoId}/?l=1` }}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo={false}
            javaScriptEnabled
            // The live IG reel page's "open in app" uses window.open('instagram://…'),
            // which spawns a popup WebView that launches the IG app and ruins the
            // reaction. Disabling multiple windows kills that popup; the https guard
            // blocks any main-frame app-redirect too. (Keeps the ?l=1 look.)
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={req => req.url.startsWith('https://') || req.url.startsWith('about:')}
            injectedJavaScriptBeforeContentLoaded={IG_BLOCK_LAUNCH_JS}
            injectedJavaScript={IG_REEL_JS}
            onMessage={(e) => {
              try {
                const msg = JSON.parse(e.nativeEvent.data);
                // Tap-to-play: the user's tap starts the reel → 'playing' begins the
                // recording. Ignore 'paused' (fires during buffering); manual Stop
                // handles early exit.
                if (msg.type === 'playing') { setIgStarted(true); }
                if (msg.type && msg.type !== 'paused') { onYtStateChange(msg.type); }
              } catch { /* ignore non-JSON messages */ }
            }}
          />
          {/* Tap the reel to start (and begin recording). pointerEvents none so the
              tap reaches the WebView — the real touch that composites the video. */}
          {!igStarted && <TapToPlayHint />}
          </View>
        </View>
      ) : videoId ? (() => {
        const coverW = Math.round(height * (16 / 9));
        const offsetX = -Math.round((coverW - width) / 2);
        return (
          <View style={styles.ytCover}>
            <View style={[styles.ytCoverInner, { left: offsetX }]}>
              <YoutubePlayer
                key={ytKey}
                ref={ytRef}
                height={height}
                width={coverW}
                videoId={videoId}
                play={ytPlaying}
                onChangeState={onYtStateChange}
                initialPlayerParams={YT_PARAMS}
                webViewStyle={YT_WV_STYLE}
              />
            </View>
          </View>
        );
      })() : <View style={styles.ytCover} />}

      {/* Camera — PIP corner when a source video drives the screen, otherwise
          full-screen (private channel clips, reviews). */}
      {ready && device ? (() => {
        const camInner = (
          <>
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              format={format}
              fps={targetFps}
              // In the PIP corner, force a TextureView preview — the default 'surface-view'
              // renders on its own layer that ignores the parent's rounded-corner clip, so the
              // camera frame bleeds past the PIP border on Android. Full-screen keeps surface-view.
              androidPreviewViewType={camAsPip ? 'texture-view' : 'surface-view'}
              // Force portrait output. Default outputOrientation is 'device', which rotates the
              // recorded file to the physical device orientation (accelerometer) even though the UI
              // is locked to portrait — holding the phone in landscape produced landscape reactions.
              // 'preview' ties the output to the preview view, which is pinned portrait by
              // Orientation.lockToPortrait(), so reactions always record portrait.
              outputOrientation="preview"
              // 2 Mbps video keeps a 180s reaction at ~48MB, under the 50MB upload limit.
              videoBitRate={2}
              isActive={camActive}
              video={true}
              audio={true}
              // MediaPipe needs RGB frames; keep the format CONSTANT across lens toggles (don't key it
              // on lensKey) so switching a lens on/off mid-session never re-negotiates the buffer.
              pixelFormat={faceTrackingAvailable ? 'rgb' : 'yuv'}
              frameProcessor={faceTrackingAvailable && effLensKey ? frameProcessor : undefined}
            />
            <FaceLensOverlay
              lens={effLensKey}
              landmarks={lensLandmarks}
              width={camAsPip ? PIP_W : width}
              height={camAsPip ? PIP_H : height}
              frameAspect={frameAspect}
            />
            {isRecording && camAsPip && <View style={styles.pipRecDot} />}
          </>
        );
        return camAsPip ? (
          // Item 1/4: PIP starts on the left, draggable within bounds. Item 2: fades while recording.
          <DraggablePip
            width={PIP_W}
            height={PIP_H}
            startX={pipStart.x}
            startY={pipStart.y}
            bounds={pipBounds}
            recording={isRecording}
            style={styles.pip}>
            {camInner}
          </DraggablePip>
        ) : (
          <View style={StyleSheet.absoluteFill}>{camInner}</View>
        );
      })() : __DEV__ && DEMO_MODE ? (
        // DEMO/screenshot: paint a still selfie where the (absent) sim camera would be,
        // so the lens picker sits over a realistic frame. PIP corner when source-driven.
        pipCamera ? (
          <View style={[styles.pip, { bottom: bottomInset + 100, right: SPACE.LG }]}>
            <Image source={DEMO_CAM} style={styles.demoCamPip} resizeMode="contain" />
            {isRecording && <View style={styles.pipRecDot} />}
          </View>
        ) : (
          <Image source={DEMO_CAM} style={StyleSheet.absoluteFill} resizeMode="contain" />
        )
      ) : __DEV__ ? (
        // Simulator placeholder so the source player + controls are still visible.
        <View style={pipCamera
          ? [styles.pip, styles.devCam, { bottom: bottomInset + 100, right: SPACE.LG }]
          : [StyleSheet.absoluteFill, styles.devCam]}>
          <Text style={styles.devCamTxt}>DEV cam{isRecording ? ' ●' : ''}</Text>
        </View>
      ) : null}

      {/* Floating emojis */}
      {floating.map(f => (
        <FloatingEmoji key={f.id} emoji={f.emoji} onDone={() => setFloating(prev => prev.filter(x => x.id !== f.id))} />
      ))}

      {/* Speaker toast */}
      {speakerToast && (
        <View style={[styles.toast, { top: topInset + SPACE.XL }]}>
          <Text style={styles.toastText}>🎧 Use headphones for cleaner audio</Text>
        </View>
      )}

      {/* Receding cap bar — gold, flaring red as the duration limit approaches */}
      {isRecording && maxDuration ? (
        <View style={[styles.capTrack, { top: topInset }]} pointerEvents="none">
          <Animated.View
            style={[styles.capFill, {
              width: capAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: capAnim.interpolate({
                inputRange: [0, 0.18, 1],
                outputRange: [C.ACCENT_HOT, C.GOLD, C.GOLD],
              }),
            }]}
          />
        </View>
      ) : null}

      {/* Recording timer badge — sits just above the record button so the lens picker owns the top. */}
      {isRecording && (
        <View style={[styles.recBadge, { bottom: bottomInset + SPACE.XL + 88 }]}>
          <View style={styles.recDot} />
          <Text style={styles.recText}>
            {maxDuration ? fmt(Math.max(0, maxDuration - elapsed)) : fmt(elapsed)}
          </Text>
        </View>
      )}

      {/* AR lens picker (top center) — available before AND during recording. Hidden in anonymous
          mode (silhouette is forced); a status badge shows instead. */}
      {!uploading && afterPhase === 'none' && (anon ? (
        <View style={[styles.anonBadgeWrap, { top: topInset + SPACE.SM }]} pointerEvents="none">
          <View style={styles.anonBadge}>
            <Text style={styles.anonBadgeTxt}>🕶  Anonymous</Text>
          </View>
        </View>
      ) : (
        <LensPicker lensKey={lensKey} onChange={setLensKey} topInset={topInset} />
      ))}

      {/* Controls. Source-driven (reactions, incl. Bunny): the source video's play/end
          drives start/stop, so the record button must NOT show before it plays — once
          recording, Stop/Restart still appear (via isRecording). Only IG WebView reels
          and non-source clips/reviews use the manual record button to start. */}
      {!uploading && afterPhase === 'none' && (!sourceDriven || isRecording || igWebEmbed) && (
        <View style={[styles.controls, { bottom: bottomInset + SPACE.XL }]}>
          {isRecording ? (
            <>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleRestart} activeOpacity={0.8}>
                <Text style={styles.secondaryBtnIcon}>↺</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.8}>
                <View style={styles.stopInner} />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.recordBtn} onPress={beginRecording} activeOpacity={0.8}>
              <View style={styles.recordInner} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Upload overlay */}
      {uploading && (
        <View style={styles.uploadOverlay}>
          <ActivityIndicator color={C.WHITE} size="large" />
          <Text style={styles.uploadText}>{uploadingText}</Text>
        </View>
      )}

      {/* Exit — available any time (discards an in-progress recording) */}
      {!uploading && afterPhase === 'none' && (
        <TouchableOpacity style={[styles.closeBtn, { top: topInset + SPACE.SM }]} onPress={handleExit}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      )}

      {/* Afterthought outro — 5s decision window, then an optional short selfie clip. */}
      {afterPhase === 'countdown' && (
        <View style={styles.afterOverlay} pointerEvents="box-none">
          <View style={styles.afterCard}>
            <Text style={styles.afterTitle}>Add an afterthought?</Text>
            <Text style={styles.afterSub}>A quick clip that plays after your reaction. Sending in {countdown}s…</Text>
            <View style={styles.afterRow}>
              <TouchableOpacity style={styles.afterSkip} onPress={() => finalize(null)} activeOpacity={0.85}>
                <Text style={styles.afterSkipTxt}>Send now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.afterRecord} onPress={startAfterthought} activeOpacity={0.85}>
                <View style={styles.afterRecordDot} />
                <Text style={styles.afterRecordTxt}>Record afterthought</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {afterPhase === 'recording' && (
        <>
          <View style={[styles.recBadge, { top: topInset + SPACE.SM }]}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>{fmt(Math.max(0, AFTERTHOUGHT_MAX - afterElapsed))}</Text>
          </View>
          <View style={[styles.controls, { bottom: bottomInset + SPACE.XL }]}>
            <TouchableOpacity style={styles.stopBtn} onPress={stopAfterthought} activeOpacity={0.8}>
              <View style={styles.stopInner} />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* DEV: start recording manually when the source video won't play
          (e.g. TikTok in the simulator), so the cap bar/auto-stop can be tested. */}
      {__DEV__ && !DEMO_MODE && sourceDriven && !isRecording && !uploading && (
        <TouchableOpacity
          style={[styles.devStart, { bottom: bottomInset + SPACE.XL }]}
          onPress={beginRecording}
          activeOpacity={0.8}>
          <Text style={styles.devStartTxt}>DEV ▶ rec</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BLACK },
  devStart: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.FULL,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.SM,
  },
  devStartTxt: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_BOLD },
  devCam: { backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  devCamTxt: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_BOLD },
  ytCover: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  // Compliance letterbox for IG/TikTok sources — top/height set inline from safe insets.
  sourceLetterbox: { position: 'absolute', left: 0, right: 0, backgroundColor: '#000', overflow: 'hidden' },
  // Afterthought decision overlay
  afterOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 130 },
  afterCard: { backgroundColor: 'rgba(0,0,0,0.82)', borderRadius: RADIUS.MD, padding: SPACE.LG, marginHorizontal: SPACE.LG, alignItems: 'center', maxWidth: 380 },
  afterTitle: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD },
  afterSub: { color: 'rgba(255,255,255,0.82)', fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, textAlign: 'center', marginTop: SPACE.XS, marginBottom: SPACE.MD },
  afterRow: { flexDirection: 'row', gap: SPACE.SM, alignItems: 'center' },
  afterSkip: { paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD, borderRadius: RADIUS.FULL, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  afterSkipTxt: { color: C.WHITE, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  afterRecord: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_HOT },
  afterRecordDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.WHITE },
  afterRecordTxt: { color: C.WHITE, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.SM },
  ytCoverInner: { position: 'absolute' },
  igPlayOverlay: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  igPlayBtn: {
    width: 72, height: 72, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  igPlayIcon: { color: C.WHITE, fontSize: 26, marginLeft: 5 },
  center: { flex: 1, backgroundColor: C.BLACK, alignItems: 'center', justifyContent: 'center', gap: SPACE.LG, padding: SPACE.XL },
  infoText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, textAlign: 'center' },
  backBtn: { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG },
  backBtnText: { color: C.INK, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM },
  pip: { position: 'absolute', width: PIP_W, height: PIP_H, borderRadius: RADIUS.MD, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  demoCamPip: { width: PIP_W + 75, marginLeft: -40, height: PIP_H + 75 },
  pipRecDot: { position: 'absolute', top: SPACE.XS, right: SPACE.XS, width: 8, height: 8, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_HOT },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS, borderRadius: RADIUS.FULL },
  toastText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  capTrack: { position: 'absolute', left: 0, right: 0, height: 4, backgroundColor: 'rgba(0,0,0,0.4)' },
  capFill: { height: 4, borderRadius: RADIUS.FULL },
  recBadge: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: SPACE.XS, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS, borderRadius: RADIUS.FULL },
  recDot: { width: 8, height: 8, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_HOT },
  recText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },
  anonBadgeWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  anonBadge: {
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: SPACE.MD, paddingVertical: 6, borderRadius: RADIUS.FULL,
  },
  anonBadgeTxt: { color: C.WHITE, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.SM, letterSpacing: 0.5 },
  controls: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACE.XL },
  secondaryBtn: { width: 56, height: 56, borderRadius: RADIUS.FULL, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  secondaryBtnIcon: { color: C.WHITE, fontSize: 20 },
  recordBtn: { width: 72, height: 72, borderRadius: RADIUS.FULL, borderWidth: 4, borderColor: C.WHITE, alignItems: 'center', justifyContent: 'center' },
  recordInner: { width: 54, height: 54, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_HOT },
  stopBtn: { width: 72, height: 72, borderRadius: RADIUS.FULL, borderWidth: 4, borderColor: C.ACCENT_MID, alignItems: 'center', justifyContent: 'center' },
  stopInner: { width: 28, height: 28, borderRadius: RADIUS.SM, backgroundColor: C.ACCENT },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', gap: SPACE.MD },
  uploadText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  closeBtn: { position: 'absolute', right: SPACE.LG, width: 36, height: 36, borderRadius: RADIUS.FULL, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: C.WHITE, fontSize: 16, fontFamily: FONT.BODY_BOLD, lineHeight: 20 },
});
