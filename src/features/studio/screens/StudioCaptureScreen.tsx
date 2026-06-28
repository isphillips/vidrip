import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, StatusBar, ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import {
  Camera, useCameraDevice, useCameraFormat, useCameraPermission, useMicrophonePermission,
  type VideoFile,
} from 'react-native-vision-camera';
import Orientation from 'react-native-orientation-locker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { MAX_STUDIO_MS } from '../../../infrastructure/creatorStudio/recipe';
import { pickVideoFromLibrary } from '../../../infrastructure/media/imagePicker';
import { createDraft, updateDraft } from '../../../infrastructure/storage/studioDraftStorage';
import ShareBaker, { type ShareBakerHandle } from '../components/ShareBaker';
import Video from 'react-native-video';
import MusicPickerSheet from '../music/MusicPickerSheet';
import { resolveTrackFile, type MusicTrack } from '../music/library';
import { configureForMixedPlayback } from '../../../infrastructure/native/audioRecorder';
import { faceLensRecipe } from '../effectRecipe';
import { LiveFaceLens, lensByKey, SPIKE_KEY } from '../../lens/faceLens';
import { useSpikeFrameProcessor } from '../../lens/spikeFrameProcessor';
import LensPicker from '../../lens/LensPicker';
import { useFaceTracking, faceTrackingAvailable } from '../../lens/faceTracking';
import { useWarpFrameProcessor, warpAvailable } from '../../lens/warpLens';
import { useAnonymousMode, ANON_LENS_KEY, ANON_VOICE_MOD } from '../../lens/useAnonymousMode';
import type { StudioStackScreenProps } from '../../../app/navigation/types';
import { DEMO_MODE } from '../../../demo/demoMode';

const MAX_SEC = MAX_STUDIO_MS / 1000; // 180s hard cap (auto-stop)

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// In-app studio camera. Records a portrait clip (720p/30fps, 2 Mbps, 180s cap) and
// hands the file to StudioDetails to publish — the same pipeline as an import.
export default function StudioCaptureScreen({ navigation }: StudioStackScreenProps<'StudioCapture'>) {
  const { top, bottom } = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [facing, setFacing] = useState<'back' | 'front'>('front');
  const device = useCameraDevice(facing);
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1280, height: 720 } },
    { fps: 30 },
  ]);
  const targetFps = format ? Math.min(30, format.maxFps) : 30;

  // AR face lens (full-screen test surface for placement). Mirror only for the front camera.
  const [lensKey, setLensKey] = useState<string | null>(null);
  // React Anonymously: when on, force the silhouette lens (overrides any pick), hide the picker, and
  // pitch the voice down on the capture-bake. effLensKey is what actually drives tracking/render/bake.
  const anon = useAnonymousMode();
  const effLensKey = anon ? ANON_LENS_KEY : lensKey;
  // Pull the full 478-pt mesh only for mesh lenses (Debug + the face-mesh effects); every other lens
  // stays on the cheap 6-anchor bridge.
  const { frameProcessor, subscribe: subscribeFace, status: lensStatus, frameAspect: measuredAspect, startTrack, stopTrack, cancelTrack } = useFaceTracking(facing === 'front', !!lensByKey(effLensKey)?.mesh);
  const isSpike = effLensKey === SPIKE_KEY;
  const spikeFrameProcessor = useSpikeFrameProcessor(isSpike);
  // Real camera-warp lens (e.g. Mega Eyes): bends the live pixels via a Skia frame processor. Each
  // warp lens names its shader in `warp`; non-warp lenses pass null for a passthrough processor.
  const warpKey = lensByKey(effLensKey)?.warp ?? null;
  const isWarp = !!warpKey && warpAvailable(warpKey);
  const warpFrameProcessor = useWarpFrameProcessor(isWarp ? warpKey : null);
  // Prefer the aspect measured from the live frame (ground truth for the keypoint coordinate space);
  // fall back to the format-derived guess until the first frame lands.
  const formatAspect = format ? Math.min(format.videoWidth, format.videoHeight) / Math.max(format.videoWidth, format.videoHeight) : 9 / 16;
  const frameAspect = measuredAspect > 0 ? measuredAspect : formatAspect;
  const { hasPermission: hasCam, requestPermission: reqCam } = useCameraPermission();
  const { hasPermission: hasMic, requestPermission: reqMic } = useMicrophonePermission();

  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  // Shown above the record button while the lens/voice bake runs (the wait before the trim screen).
  const [processing, setProcessing] = useState(false);

  // Pre-mode music: a curated track that plays aloud WHILE recording (mic off). Resolved to a local
  // file on pick so it's ready to play + to bake. When set, the recording is video-only and the track
  // becomes the video's audio on export.
  const [preTrack, setPreTrack] = useState<{ id: string; title: string; uri: string } | null>(null);
  const [musicSheet, setMusicSheet] = useState(false);
  const onPickMusic = useCallback(async (track: MusicTrack | null) => {
    if (!track) { setPreTrack(null); return; }
    try {
      const uri = await resolveTrackFile(track.id, track.url);
      setPreTrack({ id: track.id, title: track.title, uri });
    } catch { Alert.alert('Music', 'Could not load that track — check your connection.'); }
  }, []);

  const cameraRef = useRef<Camera>(null);
  // The draft created by this capture session. A re-take (record/import again before leaving the
  // studio) overwrites it instead of piling up a new draft. Reset only by remounting this screen
  // (i.e. tapping "New video" or returning after a save/publish).
  const sessionDraftIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const finishRef = useRef<((v: VideoFile) => void) | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const bakerRef = useRef<ShareBakerHandle>(null);

  useEffect(() => {
    Orientation.lockToPortrait();
    return () => {
      Orientation.unlockAllOrientations();
      if (timerRef.current) { clearInterval(timerRef.current); }
      StatusBar.setHidden(false, 'fade');
    };
  }, []);

  useEffect(() => {
    (async () => {
      const cam = hasCam || (await reqCam());
      const mic = hasMic || (await reqMic());
      setReady(cam && mic);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(async () => {
    if (!recording) { return; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    setBusy(true);
    StatusBar.setHidden(false, 'fade');
    try {
      const video = await new Promise<VideoFile>((resolve, reject) => {
        finishRef.current = resolve;
        cameraRef.current?.stopRecording().catch(reject);
      });
      const uri = video.path.startsWith('file://') ? video.path : `file://${video.path}`;
      // Capture-bake: if a lens was worn, bake it into the recording NOW (before editing) so it's in
      // the pixels for the whole flow — no track to thread, lens visible through trim/filter/overlay.
      // Falls back to the un-lensed footage if the bake fails (never lose the recording).
      let finalUri = uri;
      // fullMesh: the studio bake is into pixels + transient, so capture every vertex → dense lenses
      // (e.g. Star Map) bake all their nodes instead of just the contour subset.
      const track = effLensKey ? stopTrack({ fullMesh: true }) : null;
      const voiceMod = anon ? ANON_VOICE_MOD : null;
      if (track || voiceMod) {
        setProcessing(true);
        // Bake the overlay at the camera's 30fps so the baked lens matches the recording's smoothness.
        try { finalUri = await bakerRef.current!.bake({ sourceUri: uri, recipe: track ? faceLensRecipe(track) : null, durationSec: elapsedRef.current, voiceMod, fps: 30 }); }
        catch { finalUri = uri; }
      }
      // Persist the (lens-baked) recording as a draft immediately (survives crash/close); edits
      // autosave from here on. createDraft copies the recording into the draft's local dir.
      const draft = await createDraft(finalUri, elapsedRef.current, sessionDraftIdRef.current ?? undefined);
      sessionDraftIdRef.current = draft.id;
      // Pre-mode music: the recording is video-only, so the chosen track becomes the audio on export.
      if (preTrack) {
        await updateDraft(draft.id, {
          audio: { tracks: [{ id: preTrack.id, uri: preTrack.uri, title: preTrack.title, volume: 1, mode: 'pre' }], keepOriginal: false, originalVolume: 1 },
        });
      }
      navigation.navigate('StudioTrim', { fileUri: draft.rawFile, durationSec: elapsedRef.current, draftId: draft.id });
    } catch (e: any) {
      Alert.alert('Recording', e?.message ?? 'Could not save the recording.');
    } finally {
      setBusy(false);
      setProcessing(false);
    }
  }, [recording, navigation, effLensKey, anon, stopTrack, preTrack]);
  stopRef.current = stop;

  const start = useCallback(() => {
    if (recording || !ready) { return; }
    elapsedRef.current = 0;
    setElapsed(0);
    // Pre-mode music: route to playback+mix so the track is audible while the (mic-off) camera records.
    // No music: do NOT touch the audio session — VisionCamera owns it. On startRecording it activates
    // play-and-record (videoRecording mode, .allowBluetooth for the AirPods mic) itself, and resets from
    // the music/Playback state via updateCategory. A manual config here only races that setup and kills
    // the mic (the "voice not recording" bug).
    if (preTrack) { configureForMixedPlayback().catch(() => {}); }
    cameraRef.current?.startRecording({
      fileType: 'mp4',
      onRecordingFinished: (v) => { finishRef.current?.(v); finishRef.current = null; },
      onRecordingError: () => {
        finishRef.current = null;
        cancelTrack();
        setRecording(false); setBusy(false);
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        StatusBar.setHidden(false, 'fade');
      },
    });
    // Begin capturing the AR lens track in lock-step with the recording (no-op if no lens worn).
    if (effLensKey) { startTrack(effLensKey, measuredAspect); }
    setRecording(true);
    StatusBar.setHidden(true, 'fade');
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= MAX_SEC) { stopRef.current(); } // hard 180s cap
    }, 1000);
  }, [recording, ready, effLensKey, startTrack, measuredAspect, cancelTrack, preTrack]);

  const importLibrary = useCallback(async () => {
    if (recording) { return; }
    try {
      const picked = await pickVideoFromLibrary();
      if (picked?.uri) {
        const draft = await createDraft(picked.uri, picked.durationSec, sessionDraftIdRef.current ?? undefined);
        sessionDraftIdRef.current = draft.id;
        navigation.navigate('StudioTrim', { fileUri: draft.rawFile, durationSec: picked.durationSec, draftId: draft.id });
      }
    } catch (e: any) { Alert.alert('Import', e?.message ?? 'Could not import a video.'); }
  }, [recording, navigation]);

  return (
    <View style={styles.container}>
      {device && ready ? (
        <>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            format={format}
            fps={targetFps}
            videoBitRate={2}
            // Deactivate the camera while the lens/voice bake runs. Recording has already stopped by
            // then (stopRecording resolves before `processing` flips), and the bake works off the
            // recorded file + lens TRACK — never the live camera. Leaving it active kept the capture
            // session + frame processor + MediaPipe + Skia lens render all fighting the encoder for the
            // GPU, which is why a lensed clip baked so slowly (and could OOM/crash).
            isActive={!processing}
            video
            // Pre-mode music: mic OFF (audio={false}) so the recording is video-only and the track
            // becomes the audio on export. Otherwise capture the mic normally.
            audio={!preTrack}
            // Keep the buffer format CONSTANT (RGB) across lens toggles so the session never has to
            // re-negotiate on iOS ("-8f0"/"-11800"). RGB is also required by MediaPipe's MediaImage on
            // Android here — switching to YUV made detectForVideo throw (detect_fail).
            pixelFormat={faceTrackingAvailable ? 'rgb' : 'yuv'}
            enableBufferCompression={false}
            frameProcessor={
              isSpike ? spikeFrameProcessor
                : isWarp ? warpFrameProcessor
                  : faceTrackingAvailable && effLensKey ? frameProcessor
                    : undefined
            }
          />
          {/* Full-screen AR lens — overlay lenses only; warp + spike lenses are drawn into the preview above.
              LiveFaceLens subscribes to the tracker and re-renders in isolation, so this screen doesn't. */}
          {!isWarp && !isSpike && !processing && (
            <LiveFaceLens lens={effLensKey} subscribe={subscribeFace} width={width} height={height} frameAspect={frameAspect} />
          )}
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          {__DEV__
            ? <Text style={styles.placeholderTxt}>Camera unavailable on simulator.{'\n'}Use “Upload” to test the publish flow.</Text>
            : <ActivityIndicator color={C.ACCENT} />}
        </View>
      )}

      {/* Cover the deactivated camera during the bake so it reads as intentional, not a black glitch.
          The "Processing video…" pill renders on top of this. */}
      {processing && <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(7,0,14,0.92)' }]} pointerEvents="none" />}

      {/* Top bar: close + flip (timer moved above the record button so the lens picker can own the top) */}
      <View style={[styles.topBar, { top: top + SPACE.SM }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color={C.WHITE} />
        </TouchableOpacity>
        <View />
        <TouchableOpacity onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))} hitSlop={10} style={styles.iconBtn} disabled={recording}>
          <Ionicons name="camera-reverse-outline" size={26} color={recording ? C.SUBTLE : C.WHITE} />
        </TouchableOpacity>
      </View>

      {/* Pre-mode music banner: the mic is off while the chosen track plays during recording. */}
      {preTrack && (
        <View style={[styles.musicBanner, { top: top + 52 }]} pointerEvents="none">
          <Ionicons name="musical-notes" size={14} color={C.WHITE} style={{ marginRight: 6 }} />
          <Text style={styles.musicBannerTxt} numberOfLines={1}>{preTrack.title} · mic off while recording</Text>
        </View>
      )}

      {/* DEV diagnostic. Live per-frame landmarks now live inside <LiveFaceLens> (off this screen's
          render path), so this just reports tracker availability + status. */}
      {__DEV__ && !DEMO_MODE && (
        <Text style={[styles.lensDebug, { bottom: top - 22 }]}>
          {`FP:${faceTrackingAvailable ? 'yes' : 'NO'}  ${lensStatus}`}
        </Text>
      )}

      {/* Filter pill + slide-down grid (top center) — available while recording too. In anonymous
          mode the picker is hidden (the silhouette is forced) and a status badge shows instead. */}
      {anon ? (
        <View style={[styles.anonBadgeWrap, { top: top + SPACE.SM }]} pointerEvents="none">
          <View style={styles.anonBadge}>
            <Ionicons name="eye-off-outline" size={14} color={C.WHITE} style={{ marginRight: 6 }} />
            <Text style={styles.anonBadgeTxt}>Anonymous</Text>
          </View>
        </View>
      ) : (
        <LensPicker lensKey={lensKey} onChange={setLensKey} topInset={top} />
      )}

      {/* Recording timer — sits just above the record button so the lens picker owns the top. */}
      {recording && (
        <View style={[styles.recTimerWrap, { bottom: bottom + SPACE.XL + 90 }]} pointerEvents="none">
          <View style={styles.timerPill}><View style={styles.recDot} /><Text style={styles.timerTxt}>{fmt(elapsed)} / {fmt(MAX_SEC)}</Text></View>
        </View>
      )}

      {/* Processing pill — raised above the record button while the lens/voice bake runs. */}
      {processing && (
        <View style={[styles.recTimerWrap, { bottom: bottom + SPACE.XL + 96 }]} pointerEvents="none">
          <View style={styles.processingPill}>
            <ActivityIndicator size="small" color={C.WHITE} />
            <Text style={styles.processingTxt}>Processing video…</Text>
          </View>
        </View>
      )}

      {/* Bottom controls: import · record · spacer */}
      <View style={[styles.bottomBar, { bottom: bottom + SPACE.XL }]}>
        <TouchableOpacity onPress={importLibrary} hitSlop={10} style={styles.sideBtn} disabled={recording || busy}>
          <Ionicons name="images-outline" size={26} color={recording ? C.SUBTLE : C.WHITE} />
          <Text style={styles.sideTxt}>Upload</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={recording ? stop : start} activeOpacity={0.85} disabled={busy || (!ready && !recording)}>
          <View style={[styles.recOuter, recording && styles.recOuterActive]}>
            {busy ? <ActivityIndicator color={C.WHITE} /> : <View style={recording ? styles.recInnerStop : styles.recInner} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setMusicSheet(true)} hitSlop={10} style={styles.sideBtn} disabled={recording || busy}>
          <Ionicons name={preTrack ? 'musical-notes' : 'musical-notes-outline'} size={26} color={recording ? C.SUBTLE : preTrack ? C.ACCENT : C.WHITE} />
          <Text style={styles.sideTxt} numberOfLines={1}>{preTrack ? 'Music' : 'Add music'}</Text>
        </TouchableOpacity>
      </View>

      {/* Pre-mode music: plays aloud (mic is off) only while recording, starting from t=0 each take. */}
      {recording && preTrack && (
        <Video
          source={{ uri: preTrack.uri }}
          paused={false}
          repeat
          // eslint-disable-next-line react-native/no-inline-styles
          style={{ width: 0, height: 0 }}
          mixWithOthers="mix"
          ignoreSilentSwitch="ignore"
        />
      )}

      <MusicPickerSheet visible={musicSheet} currentId={preTrack?.id} onSelect={onPickMusic} onClose={() => setMusicSheet(false)} />

      {/* Off-screen Skia→MP4 baker: composites the AR lens into the recording at capture-stop. */}
      <ShareBaker ref={bakerRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  musicBanner: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center',
    maxWidth: '80%', backgroundColor: 'rgba(160,92,255,0.85)',
    paddingHorizontal: SPACE.MD, paddingVertical: 6, borderRadius: RADIUS.FULL,
  },
  musicBannerTxt: { color: C.WHITE, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  processingPill: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    backgroundColor: 'rgba(12,10,9,0.93)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.SM + 2, borderRadius: RADIUS.FULL,
  },
  processingTxt: { color: C.WHITE, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.SM },
  placeholder: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.XL },
  placeholderTxt: { color: C.MUTED, fontFamily: FONT.BODY, textAlign: 'center', lineHeight: 22 },
  topBar: {
    position: 'absolute', left: SPACE.LG, right: SPACE.LG,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  timerPill: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: SPACE.MD, paddingVertical: 6, borderRadius: RADIUS.FULL,
  },
  anonBadgeWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  anonBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: SPACE.MD, paddingVertical: 6, borderRadius: RADIUS.FULL,
  },
  anonBadgeTxt: { color: C.WHITE, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.SM, letterSpacing: 0.5 },
  recTimerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.DANGER },
  timerTxt: { color: C.WHITE, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  bottomBar: {
    position: 'absolute', left: SPACE.XL, right: SPACE.XL,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  sideBtn: { width: 64, alignItems: 'center', gap: 4 },
  sideTxt: { color: C.WHITE, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.XS },
  recOuter: {
    width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: C.WHITE,
    alignItems: 'center', justifyContent: 'center',
  },
  recOuterActive: { borderColor: C.DANGER },
  recInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.DANGER },
  recInnerStop: { width: 30, height: 30, borderRadius: 6, backgroundColor: C.DANGER },
  lensDebug: { position: 'absolute', alignSelf: 'center', color: '#0f0', fontFamily: FONT.BODY_SEMIBOLD, fontSize: 11, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
