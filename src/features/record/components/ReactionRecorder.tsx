import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, StatusBar, useWindowDimensions, Animated,
} from 'react-native';
import Orientation from 'react-native-orientation-locker';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import TikTokPlayer, { type TikTokPlayerHandle } from '../../../components/TikTokPlayer';
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
import {
  checkHeadphonesConnected,
  restoreAudioRoute,
} from '../../../infrastructure/native/audioRecorder';

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
  sourceType?: 'youtube' | 'tiktok';
  onSave: (filePath: string, duration: number, ytStartOffset: number, recordedWithHeadphones: boolean) => Promise<void>;
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
  const sourceDriven = !!videoId;

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
  const [ytPlaying, setYtPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [speakerToast, setSpeakerToast] = useState(false);
  const [floating, setFloating] = useState<{ id: number; emoji: string }[]>([]);

  const ytRef = useRef<YoutubeIframeRef>(null);
  const ttRef = useRef<TikTokPlayerHandle>(null);
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
  }, [startTimer, stopTimer, maxDuration, capAnim]);

  const handleStop = useCallback(async () => {
    if (!isRecording) { return; }
    stopTimer();
    capAnim.stopAnimation();
    setIsRecording(false);
    StatusBar.setHidden(false, 'fade');
    setUploading(true);

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
      // Dismiss the recorder immediately — upload runs in the background via
      // the upload store and shows progress as a toast.
      onBack();
      onSave(video.path, elapsedRef.current, ytStartOffsetRef.current, recordedWithHeadphonesRef.current)
        .catch(() => {});
    } catch (e: any) {
      Alert.alert('Could Not Save', e?.message ?? 'Something went wrong. Please try again.');
      setUploading(false);
    }
  }, [isRecording, stopTimer, onSave, onBack]);

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
      await cameraRef.current?.stopRecording().catch(() => {});
    }
    onBack();
  }, [isRecording, stopTimer, onBack, capAnim]);

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
    await cameraRef.current?.stopRecording().catch(() => {});
    ytKeyRef.current += 1;
    setYtKey(ytKeyRef.current);
  }, [stopTimer]);

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

  if (!ready || !device) {
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
      {/* Source-video full-screen background (or black if no videoId) */}
      {videoId && sourceType === 'tiktok' ? (
        <View style={styles.ytCover}>
          <TikTokPlayer
            ref={ttRef}
            style={{ width, height, backgroundColor: '#000' }}
            videoId={videoId}
            onChangeState={onYtStateChange}
          />
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
      {ready && device && (
        <View style={sourceDriven
          ? [styles.pip, { bottom: bottomInset + 100, right: SPACE.LG }]
          : StyleSheet.absoluteFill}>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            format={format}
            fps={targetFps}
            // 2 Mbps video (+~0.13 audio) keeps a 180s reaction/review at ~48MB,
            // under the 50MB Supabase storage upload limit (60s ≈ 16MB).
            videoBitRate={2}
            isActive={true}
            video={true}
            audio={true}
          />
          {isRecording && sourceDriven && <View style={styles.pipRecDot} />}
        </View>
      )}

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

      {/* Controls. Source-driven (reactions): start is driven by the source video,
          but once recording you can restart or stop manually. Otherwise (private
          clips / reviews) the manual record button starts it. */}
      {!uploading && (!sourceDriven || isRecording) && (
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
  ytCover: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  ytCoverInner: { position: 'absolute' },
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
