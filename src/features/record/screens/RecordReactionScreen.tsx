import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { uploadReaction } from '../../../infrastructure/supabase/queries/reactions';
import type { RecordStackScreenProps } from '../../../app/navigation/types';

const MAX_DURATION_S = 60;
const PIP_W = 88;
const PIP_H = Math.round(PIP_W * 16 / 9);
const YT_PARAMS = { rel: false as const, controls: true as const };
const YT_WV_STYLE = { backgroundColor: '#000000' };

export default function RecordReactionScreen({
  route,
  navigation,
}: RecordStackScreenProps<'RecordReaction'>) {
  const { threadId, videoId } = route.params;
  const { user } = useAuthStore();
  const { width, height } = useWindowDimensions();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  const isLandscape = width > height;
  const usableH = height - topInset - bottomInset - 2;
  const topH = Math.round(usableH * 0.30);
  const bottomH = usableH - topH;

  const device = useCameraDevice('front');
  const { hasPermission: hasCam, requestPermission: requestCam } = useCameraPermission();
  const { hasPermission: hasMic, requestPermission: requestMic } = useMicrophonePermission();

  const [ready, setReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  // ytKey only used for restart — forces a remount so iOS reliably stops YouTube
  const [ytKey, setYtKey] = useState(0);

  const cameraRef = useRef<Camera>(null);
  const ytRef = useRef<YoutubeIframeRef>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const hasStartedRef = useRef(false);
  const isCancellingRef = useRef(false);

  useEffect(() => {
    (async () => {
      const cam = hasCam || (await requestCam());
      const mic = hasMic || (await requestMic());
      setReady(cam && mic);
    })();
    return () => { if (timerRef.current) { clearInterval(timerRef.current); } };
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); }
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= MAX_DURATION_S) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        isRecordingRef.current = false;
        isPausedRef.current = false;
        setIsRecording(false);
        setIsPaused(false);
        cameraRef.current?.stopRecording();
      }
    }, 1000);
  }, []);

  const stopImpl = useCallback(async () => {
    if (!isRecordingRef.current && !isPausedRef.current) { return; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    isRecordingRef.current = false;
    isPausedRef.current = false;
    setIsRecording(false);
    setIsPaused(false);
    await cameraRef.current?.stopRecording();
  }, []);

  const handleRestart = useCallback(async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    isRecordingRef.current = false;
    isPausedRef.current = false;
    isCancellingRef.current = true;
    hasStartedRef.current = false;
    elapsedRef.current = 0;
    setIsRecording(false);
    setIsPaused(false);
    setElapsed(0);
    try { await cameraRef.current?.cancelRecording(); } catch { /* not recording */ }
    // Remount YouTube player at 0 so it reloads paused — user taps play to restart
    setYtKey(k => k + 1);
  }, []);

  // Camera-only start (YouTube drives playback via onChangeState)
  const startCameraRecording = useCallback(() => {
    elapsedRef.current = 0;
    setElapsed(0);
    isRecordingRef.current = true;
    setIsRecording(true);
    startTimer();
    cameraRef.current?.startRecording({
      onRecordingFinished: async (video) => {
        setUploading(true);
        try {
          await uploadReaction({
            userId: user!.id,
            threadId,
            filePath: video.path,
            duration: elapsedRef.current,
          });
          navigation.goBack();
        } catch {
          Alert.alert('Upload Failed', 'Could not save your reaction. Please try again.');
          setUploading(false);
        }
      },
      onRecordingError: (error) => {
        if (isCancellingRef.current) { isCancellingRef.current = false; return; }
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        isRecordingRef.current = false;
        isPausedRef.current = false;
        setIsRecording(false);
        setIsPaused(false);
        Alert.alert('Recording Error', error.message);
      },
    });
  }, [startTimer, user, threadId, navigation]);

  // Camera-only pause — YouTube paused itself, we just sync the camera
  const pauseCamera = useCallback(async () => {
    if (!isRecordingRef.current) { return; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    isRecordingRef.current = false;
    isPausedRef.current = true;
    setIsRecording(false);
    setIsPaused(true);
    await cameraRef.current?.pauseRecording();
  }, []);

  // Camera-only resume — YouTube resumed itself, we just sync the camera
  const resumeCamera = useCallback(async () => {
    if (!isPausedRef.current) { return; }
    isPausedRef.current = false;
    isRecordingRef.current = true;
    setIsPaused(false);
    setIsRecording(true);
    await cameraRef.current?.resumeRecording();
    startTimer();
  }, [startTimer]);

  // YouTube drives everything — camera just follows.
  // play={false} is kept static so the library never sends redundant commands
  // that would cause YouTube to emit spurious state-change events.
  const onYtStateChange = useCallback((state: string) => {
    if (state === 'playing') {
      if (!hasStartedRef.current) {
        hasStartedRef.current = true;
        startCameraRecording();
      } else if (isPausedRef.current) {
        resumeCamera();
      }
    } else if (state === 'paused' || state === 'ended') {
      if (isRecordingRef.current) {
        pauseCamera();
      }
    }
  }, [startCameraRecording, resumeCamera, pauseCamera]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (!ready) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoText}>Camera and microphone access required</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!device) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoText}>No front camera found</Text>
      </View>
    );
  }

  const active = isRecording || isPaused;

  const timerBadge = active ? (
    <View style={[styles.timerBadge, isPaused && styles.timerBadgePaused]}>
      {!isPaused && <View style={styles.recDot} />}
      <Text style={styles.timerText}>{isPaused ? '⏸  ' : ''}{fmt(elapsed)}</Text>
      {!isPaused && <Text style={styles.timerMax}>/ {fmt(MAX_DURATION_S)}</Text>}
    </View>
  ) : null;

  // Only show stop + restart when recording is active; no custom pause/resume
  const controlButtons = !uploading && active ? (
    <View style={styles.controls}>
      <TouchableOpacity style={styles.secondaryBtn} onPress={handleRestart} activeOpacity={0.8}>
        <Text style={styles.secondaryBtnIcon}>↺</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.stopBtn} onPress={stopImpl} activeOpacity={0.8}>
        <View style={styles.stopInner} />
      </TouchableOpacity>
    </View>
  ) : null;

  const ytPlayer = (h: number, w: number) => (
    <YoutubePlayer
      key={ytKey}
      ref={ytRef}
      height={h}
      width={w}
      videoId={videoId}
      play={false}
      onChangeState={onYtStateChange}
      initialPlayerParams={YT_PARAMS}
      webViewStyle={YT_WV_STYLE}
    />
  );

  // ─── Landscape: YouTube full-screen, Camera as PiP ───────────────────────
  if (isLandscape) {
    return (
      <View style={styles.container}>
        {ytPlayer(height, width)}

        <View style={[styles.pip, { bottom: bottomInset + SPACE.LG, right: SPACE.LG }]}>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={!uploading}
            video={true}
            audio={true}
          />
        </View>

        {uploading && (
          <View style={styles.uploadOverlay}>
            <ActivityIndicator color={C.WHITE} size="large" />
            <Text style={styles.uploadText}>Saving reaction…</Text>
          </View>
        )}

        {active && (
          <View style={[styles.absTopLeft, { top: topInset + SPACE.SM }]}>
            {timerBadge}
          </View>
        )}

        {!uploading && active && (
          <View style={[styles.controls, styles.absBottomLeft, { bottom: bottomInset + SPACE.LG }]}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleRestart} activeOpacity={0.8}>
              <Text style={styles.secondaryBtnIcon}>↺</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stopBtn} onPress={stopImpl} activeOpacity={0.8}>
              <View style={styles.stopInner} />
            </TouchableOpacity>
          </View>
        )}

        {!active && !uploading && (
          <TouchableOpacity
            style={[styles.closeBtn, { top: topInset + SPACE.SM, right: SPACE.LG }]}
            onPress={() => navigation.goBack()}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ─── Portrait: 30% video / 70% camera ────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={{ height: topInset, backgroundColor: C.BLACK }} />

      <View style={[styles.videoPane, { height: topH }]}>
        {ytPlayer(topH, width)}
      </View>

      <View style={[styles.divider, (isRecording && !isPaused) && styles.dividerActive]} />

      <View style={[styles.cameraPane, { height: bottomH }]}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={!uploading}
          video={true}
          audio={true}
        />

        {timerBadge}

        {uploading && (
          <View style={styles.uploadOverlay}>
            <ActivityIndicator color={C.WHITE} size="large" />
            <Text style={styles.uploadText}>Saving reaction…</Text>
          </View>
        )}

        {controlButtons}
      </View>

      <View style={{ height: bottomInset, backgroundColor: C.BLACK }} />

      {!active && !uploading && (
        <TouchableOpacity
          style={[styles.closeBtn, { top: topInset + SPACE.SM }]}
          onPress={() => navigation.goBack()}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BLACK },
  center: {
    flex: 1, backgroundColor: C.BLACK, alignItems: 'center',
    justifyContent: 'center', gap: SPACE.LG, padding: SPACE.XL,
  },
  videoPane: { backgroundColor: C.BLACK, overflow: 'hidden' },
  divider: { height: 2, backgroundColor: C.BORDER },
  dividerActive: { backgroundColor: C.ACCENT_MID },
  cameraPane: { overflow: 'hidden', backgroundColor: '#111' },
  pip: {
    position: 'absolute',
    width: PIP_W,
    height: PIP_H,
    borderRadius: RADIUS.LG,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  timerBadge: {
    position: 'absolute',
    top: SPACE.MD,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.XS,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: SPACE.MD,
    paddingVertical: SPACE.XS,
    borderRadius: RADIUS.FULL,
  },
  timerBadgePaused: { backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: C.BORDER },
  recDot: { width: 8, height: 8, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_MID },
  timerText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },
  timerMax: { color: 'rgba(255,255,255,0.45)', fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', gap: SPACE.MD,
  },
  uploadText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  controls: {
    position: 'absolute',
    bottom: SPACE.XL,
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACE.XL,
  },
  secondaryBtn: {
    width: 56, height: 56, borderRadius: RADIUS.FULL,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnIcon: { color: C.WHITE, fontSize: 20 },
  stopBtn: {
    width: 72, height: 72, borderRadius: RADIUS.FULL,
    borderWidth: 4, borderColor: C.ACCENT_MID,
    alignItems: 'center', justifyContent: 'center',
  },
  stopInner: { width: 28, height: 28, borderRadius: RADIUS.SM, backgroundColor: C.ACCENT },
  closeBtn: {
    position: 'absolute',
    right: SPACE.LG,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: C.WHITE, fontSize: 16, fontFamily: FONT.BODY_BOLD, lineHeight: 20 },
  infoText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, textAlign: 'center' },
  backBtn: { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG },
  backBtnText: { color: C.INK, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM },
  absTopLeft: { position: 'absolute', left: SPACE.LG },
  absBottomLeft: { position: 'absolute', left: SPACE.XL },
});
