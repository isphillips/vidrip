import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
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
import type { OverlayRecipe } from '../../studio/effectRecipe';
import { LiveFaceLensOverlay, type FaceLensTrack } from '../../lens/faceLens';
import { useFaceTracking, faceTrackingAvailable } from '../../lens/faceTracking';


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
  sourceType?: 'youtube' | 'tiktok' | 'instagram' | 'bunny';
  onSave: (filePath: string, duration: number, ytStartOffset: number, recordedWithHeadphones: boolean, lensTrack?: FaceLensTrack | null) => Promise<void>;
  onBack: () => void;
  uploadingText?: string;
  /** Hard cap in seconds — recording auto-stops when reached (e.g. 60s reviews). */
  maxDuration?: number;
}

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
}: ReactionRecorderProps) {
  const { width, height } = useWindowDimensions();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();

  // With a source video (feed / channel-post reactions) the source's own play /
  // pause / end drives recording — no manual buttons. Without one (private channel
  // clips, reviews) the user records with the manual controls.
  // Creator (Bunny) source — token-authed iframe embed. Its play/pause is now bridged out
  // (BunnyVideoLayer), so it drives recording like the other sources.
  const bunnyEmbed = sourceType === 'bunny' && !!embedUrl;
  const sourceDriven = !!videoId || (sourceType === 'instagram' && !!sourceUri) || bunnyEmbed;
  const igSource = sourceType === 'instagram' && !!sourceUri;
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
  // Face lenses are disabled in the reaction recorder for now (still being tuned in the studio
  // camera). lensKey stays null so the whole tracking/overlay pipeline below is inert; re-enable by
  // restoring the lens picker UI and making this stateful again.
  const lensKey: string | null = null;
  const { frameProcessor, landmarksShared, startTrack, stopTrack, cancelTrack } = useFaceTracking(true);
  // Camera-frame aspect (w/h) — shared by the live overlay and the captured track so replay
  // cover-crops the same way the preview did.
  const frameAspect = format ? Math.min(format.videoWidth, format.videoHeight) / Math.max(format.videoWidth, format.videoHeight) : 9 / 16;
  // Latest captured lens track, set on stop and handed to onSave.
  const lensTrackRef = useRef<FaceLensTrack | null>(null);
  const lensKeyRef = useRef<string | null>(null);
  useEffect(() => { lensKeyRef.current = lensKey; }, [lensKey]);
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
      onRecordingFinished: (video) => { recordingCallbackRef.current?.(video); recordingCallbackRef.current = null; },
      onRecordingError: () => { recordingCallbackRef.current = null; setIsRecording(false); stopTimer(); StatusBar.setHidden(false, 'fade'); },
    });

    setIsRecording(true);
    StatusBar.setHidden(true, 'fade');
    startTimer();
    if (maxDuration) {
      capAnim.setValue(1);
      Animated.timing(capAnim, { toValue: 0, duration: maxDuration * 1000, useNativeDriver: false }).start();
    }
  }, [startTimer, stopTimer, maxDuration, capAnim, startTrack, frameAspect]);

  const handleStop = useCallback(async () => {
    if (!isRecording) { return; }
    stopTimer();
    capAnim.stopAnimation();
    setIsRecording(false);
    StatusBar.setHidden(false, 'fade');
    setUploading(true);
    // Finalize the captured lens track (null when no lens was on / no face seen).
    lensTrackRef.current = lensKeyRef.current ? stopTrack() : null;

    if (speakerOverrideRef.current) { restoreAudioRoute().catch(() => {}); speakerOverrideRef.current = false; }

    try {
      const video = await Promise.race([
        new Promise<VideoFile>((resolve, reject) => {
          recordingCallbackRef.current = resolve;
          cameraRef.current?.stopRecording().catch(reject);
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Recording timed out — please try again.')), 15000)
        ),
      ]);
      // Commit the save first (fast: DB row + local copy) so the reaction shows
      // as watchable the moment we return; the slow upload runs in the background
      // via the upload store and shows progress as a toast.
      await onSave(video.path, elapsedRef.current, ytStartOffsetRef.current, recordedWithHeadphonesRef.current, lensTrackRef.current);
      onBack();
    } catch (e: any) {
      Alert.alert('Could Not Save', e?.message ?? 'Something went wrong. Please try again.');
      setUploading(false);
    }
  }, [isRecording, stopTimer, onSave, onBack, stopTrack]);

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
  }, [stopTimer, cancelTrack]);

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

  return (
    <View style={styles.container}>
      {/* Source-video full-screen background (or black if no source) */}
      {bunnyEmbed ? (
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
      ) : igSource ? (
        <View style={styles.ytCover}>
          <InstagramPlayer
            key={ytKey}
            ref={igRef}
            uri={sourceUri as string}
            style={{ width, height }}
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
      ) : videoId && sourceType === 'tiktok' ? (
        <View style={styles.ytCover}>
          <TikTokPlayer
            key={ytKey}
            ref={ttRef}
            style={{ width, height, backgroundColor: '#000' }}
            videoId={videoId}
            onChangeState={onYtStateChange}
          />
        </View>
      ) : videoId && sourceType === 'instagram' ? (
        <View style={styles.ytCover}>
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
      {ready && device ? (
        <View style={pipCamera
          ? [styles.pip, { bottom: bottomInset + 100, right: SPACE.LG }]
          : StyleSheet.absoluteFill}>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            format={format}
            fps={targetFps}
            // In the PIP corner, force a TextureView preview. The default
            // 'surface-view' renders on its own SurfaceView layer that ignores
            // the parent's rounded-corner clip, so the square camera frame
            // bleeds past the PIP border on Android. TextureView is an ordinary
            // child view and honors overflow:'hidden' + borderRadius. Full-screen
            // has nothing to clip, so it keeps the more efficient surface-view.
            androidPreviewViewType={pipCamera ? 'texture-view' : 'surface-view'}
            // 2 Mbps video (+~0.13 audio) keeps a 180s reaction/review at ~48MB,
            // under the 50MB Supabase storage upload limit (60s ≈ 16MB).
            videoBitRate={2}
            isActive={camActive}
            video={true}
            audio={true}
            // MediaPipe needs BGRA frames; VisionCamera defaults to YUV (→ detect_fail).
            pixelFormat={faceTrackingAvailable && lensKey ? 'rgb' : 'yuv'}
            frameProcessor={faceTrackingAvailable && lensKey ? frameProcessor : undefined}
          />
          {/* AR lens — UI-thread animated overlay, no JS re-renders per frame. */}
          <LiveFaceLensOverlay
            lens={lensKey}
            landmarksShared={landmarksShared}
            width={pipCamera ? PIP_W : width}
            height={pipCamera ? PIP_H : height}
            frameAspect={frameAspect}
          />
          {isRecording && pipCamera && <View style={styles.pipRecDot} />}
        </View>
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

      {/* Recording timer badge — counts down to the cap when one is set */}
      {isRecording && (
        <View style={[styles.recBadge, { top: topInset + SPACE.SM }]}>
          <View style={styles.recDot} />
          <Text style={styles.recText}>
            {maxDuration ? fmt(Math.max(0, maxDuration - elapsed)) : fmt(elapsed)}
          </Text>
        </View>
      )}

      {/* Face lenses are disabled in the reaction recorder for now (still being dialed in — see
          the studio camera). The tracking plumbing stays inert because lensKey is always null. */}

      {/* Controls. Source-driven (reactions): start is driven by the source video,
          but once recording you can restart or stop manually. Otherwise (private
          clips / reviews) the manual record button starts it. */}
      {!uploading && (!sourceDriven || isRecording || igWebEmbed || bunnyEmbed) && (
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
      {!uploading && (
        <TouchableOpacity style={[styles.closeBtn, { top: topInset + SPACE.SM }]} onPress={handleExit}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      )}

      {/* DEV: start recording manually when the source video won't play
          (e.g. TikTok in the simulator), so the cap bar/auto-stop can be tested. */}
      {__DEV__ && sourceDriven && !isRecording && !uploading && (
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
  pipRecDot: { position: 'absolute', top: SPACE.XS, right: SPACE.XS, width: 8, height: 8, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_HOT },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS, borderRadius: RADIUS.FULL },
  toastText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  capTrack: { position: 'absolute', left: 0, right: 0, height: 4, backgroundColor: 'rgba(0,0,0,0.4)' },
  capFill: { height: 4, borderRadius: RADIUS.FULL },
  recBadge: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: SPACE.XS, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS, borderRadius: RADIUS.FULL },
  recDot: { width: 8, height: 8, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_HOT },
  recText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },
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
