import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  useWindowDimensions,
  Animated,
} from 'react-native';

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
  const scale = anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.5, 1.2, 1] });
  return (
    <Animated.Text style={[floatStyles.emoji, { transform: [{ translateY }, { translateX }, { scale }], opacity }]}>
      {emoji}
    </Animated.Text>
  );
}
const floatStyles = StyleSheet.create({
  emoji: { position: 'absolute', bottom: 120, alignSelf: 'center', fontSize: 36 },
});

import Orientation from 'react-native-orientation-locker';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  type VideoFile,
} from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { saveReaction } from '../../../infrastructure/storage/reactionStorage';
import { STORAGE_MODE } from '../../../infrastructure/storage/config';
import {
  checkHeadphonesConnected,
  routeAudioToSpeaker,
  restoreAudioRoute,
} from '../../../infrastructure/native/audioRecorder';
import type { RecordStackScreenProps } from '../../../app/navigation/types';

const YT_PARAMS = { rel: false as const, controls: true as const };
const YT_WV_STYLE = { backgroundColor: '#000000' };
const PIP_W = 110;
const PIP_H = 155;

export default function RecordReactionScreen({
  route,
  navigation,
}: RecordStackScreenProps<'RecordReaction'>) {
  const { threadId, videoId } = route.params;
  const { user } = useAuthStore();
  const { width, height } = useWindowDimensions();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();

  const device = useCameraDevice('front');
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
  const cameraRef = useRef<Camera>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const hasStartedRef = useRef(false);
  const skipNextPausedRef = useRef(false);
  const ytKeyRef = useRef(0);
  const ytStartOffsetRef = useRef(0);
  const recordingCallbackRef = useRef<((v: VideoFile) => void) | null>(null);
  const speakerOverrideRef = useRef(false);
  const [ytKey, setYtKey] = useState(0);

  useEffect(() => {
    Orientation.lockToPortrait();
    return () => { Orientation.unlockAllOrientations(); };
  }, []);

  useEffect(() => {
    (async () => {
      const cam = hasCam || (await requestCam());
      const mic = hasMic || (await requestMic());
      setReady(cam && mic);
    })();
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); }
      if (speakerOverrideRef.current) { restoreAudioRoute().catch(() => {}); }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); }
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const beginRecording = useCallback(async () => {
    if (hasStartedRef.current) { return; }
    hasStartedRef.current = true;
    ytStartOffsetRef.current = 0; // YouTube always starts from beginning

    // Headphone detection — route to speaker so mic captures YouTube audio
    try {
      const headphones = await checkHeadphonesConnected();
      if (headphones) {
        await routeAudioToSpeaker();
        speakerOverrideRef.current = true;
        setSpeakerToast(true);
        setTimeout(() => setSpeakerToast(false), 3000);
      }
    } catch { /* ignore — proceed with recording */ }

    // Start camera recording
    cameraRef.current?.startRecording({
      fileType: 'mp4',
      onRecordingFinished: (video) => {
        recordingCallbackRef.current?.(video);
        recordingCallbackRef.current = null;
      },
      onRecordingError: () => {
        recordingCallbackRef.current = null;
        setIsRecording(false);
        stopTimer();
        StatusBar.setHidden(false, 'fade');
      },
    });

    setIsRecording(true);
    StatusBar.setHidden(true, 'fade');
    startTimer();
  }, [startTimer, stopTimer]);

  const handleStop = useCallback(async () => {
    if (!isRecording) { return; }
    stopTimer();
    setIsRecording(false);
    StatusBar.setHidden(false, 'fade');
    setUploading(true);

    // Restore audio route before saving
    if (speakerOverrideRef.current) {
      restoreAudioRoute().catch(() => {});
      speakerOverrideRef.current = false;
    }

    try {
      const video = await new Promise<VideoFile>((resolve, reject) => {
        recordingCallbackRef.current = resolve;
        cameraRef.current?.stopRecording().catch(reject);
      });
      await saveReaction({
        userId: user!.id,
        threadId,
        filePath: video.path,
        duration: elapsedRef.current,
        mode: STORAGE_MODE,
        ytVideoId: videoId,
        ytStartOffset: ytStartOffsetRef.current,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.message ?? 'Could not save your reaction. Please try again.');
      setUploading(false);
    }
  }, [isRecording, stopTimer, user, threadId, videoId, navigation]);

  const handleRestart = useCallback(async () => {
    stopTimer();
    elapsedRef.current = 0;
    setElapsed(0);
    hasStartedRef.current = false;
    setIsRecording(false);
    setYtPlaying(false);
    StatusBar.setHidden(false, 'fade');
    if (speakerOverrideRef.current) {
      restoreAudioRoute().catch(() => {});
      speakerOverrideRef.current = false;
    }
    // Stop active recording before resetting
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
      if (skipNextPausedRef.current) { skipNextPausedRef.current = false; }
    } else if (state === 'ended') {
      setYtPlaying(false);
      skipNextPausedRef.current = false;
    }
  }, [beginRecording]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (!ready || !device) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoText}>Camera and microphone access required</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* YouTube — cover fill: player wider than screen, centered, clipped */}
      {(() => {
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
      })()}

      {/* Camera PIP — bottom right */}
      {ready && device && (
        <View style={[styles.pip, { bottom: bottomInset + 100, right: SPACE.LG }]}>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            video={true}
            audio={true}
          />
          {isRecording && <View style={styles.pipRecDot} />}
        </View>
      )}

      {/* Floating emojis */}
      {floating.map(f => (
        <FloatingEmoji
          key={f.id}
          emoji={f.emoji}
          onDone={() => setFloating(prev => prev.filter(x => x.id !== f.id))}
        />
      ))}

      {/* Speaker override toast */}
      {speakerToast && (
        <View style={[styles.toast, { top: topInset + SPACE.XL }]}>
          <Text style={styles.toastText}>🔊 Playing through speaker for recording</Text>
        </View>
      )}

      {/* Recording timer badge */}
      {isRecording && (
        <View style={[styles.recBadge, { top: topInset + SPACE.SM }]}>
          <View style={styles.recDot} />
          <Text style={styles.recText}>{fmt(elapsed)}</Text>
        </View>
      )}

      {/* Controls */}
      {!uploading && (
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
          <Text style={styles.uploadText}>Saving reaction…</Text>
        </View>
      )}

      {/* Close button */}
      {!isRecording && !uploading && (
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
  ytCover: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  ytCoverInner: { position: 'absolute' },
  center: {
    flex: 1, backgroundColor: C.BLACK,
    alignItems: 'center', justifyContent: 'center', gap: SPACE.LG, padding: SPACE.XL,
  },
  infoText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, textAlign: 'center' },
  backBtn: { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG },
  backBtnText: { color: C.INK, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM },

  // Camera PIP
  pip: {
    position: 'absolute',
    width: PIP_W, height: PIP_H,
    borderRadius: RADIUS.MD,
    overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
  },
  pipRecDot: {
    position: 'absolute', top: SPACE.XS, right: SPACE.XS,
    width: 8, height: 8, borderRadius: RADIUS.FULL,
    backgroundColor: C.ACCENT_HOT,
  },

  // Toast
  toast: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS,
    borderRadius: RADIUS.FULL,
  },
  toastText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },

  // Recording badge
  recBadge: {
    position: 'absolute', alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: SPACE.XS,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS,
    borderRadius: RADIUS.FULL,
  },
  recDot: { width: 8, height: 8, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_HOT },
  recText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },

  // Controls
  controls: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACE.XL,
  },
  secondaryBtn: {
    width: 56, height: 56, borderRadius: RADIUS.FULL,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnIcon: { color: C.WHITE, fontSize: 20 },
  recordBtn: {
    width: 72, height: 72, borderRadius: RADIUS.FULL,
    borderWidth: 4, borderColor: C.WHITE,
    alignItems: 'center', justifyContent: 'center',
  },
  recordInner: {
    width: 54, height: 54, borderRadius: RADIUS.FULL,
    backgroundColor: C.ACCENT_HOT,
  },
  stopBtn: {
    width: 72, height: 72, borderRadius: RADIUS.FULL,
    borderWidth: 4, borderColor: C.ACCENT_MID,
    alignItems: 'center', justifyContent: 'center',
  },
  stopInner: { width: 28, height: 28, borderRadius: RADIUS.SM, backgroundColor: C.ACCENT },

  // Emoji drawer
  emojiDrawer: { position: 'absolute', alignItems: 'center', gap: SPACE.SM },
  emojiPicker: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: RADIUS.LG, padding: SPACE.SM,
    alignItems: 'center', gap: SPACE.SM,
  },
  emojiGlyph: { fontSize: 28 },
  emojiToggle: {
    width: 44, height: 44, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  emojiToggleIcon: { fontSize: 22 },

  // Upload
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', gap: SPACE.MD,
  },
  uploadText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },

  // Close
  closeBtn: {
    position: 'absolute', right: SPACE.LG,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: C.WHITE, fontSize: 16, fontFamily: FONT.BODY_BOLD, lineHeight: 20 },
});
