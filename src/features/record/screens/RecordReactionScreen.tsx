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

const QUICK_EMOJIS = ['❤️', '😂', '😮', '🔥', '👏', '😭'];

function FloatingEmoji({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  // Random initial sway direction per emoji instance
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
  emoji: { position: 'absolute', bottom: 100, alignSelf: 'center', fontSize: 36 },
});
import Orientation from 'react-native-orientation-locker';
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
import { saveReaction } from '../../../infrastructure/storage/reactionStorage';
import { STORAGE_MODE } from '../../../infrastructure/storage/config';
import {
  startScreenCapture,
  stopScreenCapture,
  cancelScreenCapture,
  releaseScreenCapture,
} from '../../../infrastructure/native/screenRecorder';
import type { RecordStackScreenProps } from '../../../app/navigation/types';

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

  const usableH = height - topInset - bottomInset - 2;
  const topH = Math.round(usableH * 0.30);
  const bottomH = usableH - topH;

  const device = useCameraDevice('front');
  const { hasPermission: hasCam, requestPermission: requestCam } = useCameraPermission();
  const { hasPermission: hasMic, requestPermission: requestMic } = useMicrophonePermission();

  const [ready, setReady] = useState(false);
  const [ytPlaying, setYtPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [floating, setFloating] = useState<{ id: number; emoji: string }[]>([]);
  const floatIdRef = useRef(0);

  const ytRef = useRef<YoutubeIframeRef>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const hasStartedRef = useRef(false);
  const skipNextPausedRef = useRef(false);
  const ytKeyRef = useRef(0);
  const [ytKey, setYtKey] = useState(0);

  useEffect(() => {
    Orientation.lockToPortrait();
    return () => { Orientation.unlockAllOrientations(); };
  }, []);

  // Request cam/mic permissions then start screen capture immediately
  useEffect(() => {
    (async () => {
      const cam = hasCam || (await requestCam());
      const mic = hasMic || (await requestMic());
      setReady(cam && mic);
    })();
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); }
      // releaseScreenCapture tears down the MediaProjection + foreground service on Android.
      // On iOS it's equivalent to cancelCapture.
      releaseScreenCapture().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start capture as soon as cam/mic are granted
  useEffect(() => {
    if (!ready) { return; }
    startScreenCapture().catch(() => { navigation.goBack(); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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

  // Start recording (timer + state) — called by YouTube play or record button
  const beginRecording = useCallback(() => {
    if (hasStartedRef.current) { return; }
    hasStartedRef.current = true;
    elapsedRef.current = 0;
    setElapsed(0);
    setIsRecording(true);
    StatusBar.setHidden(true, 'fade');
    startTimer();
  }, [startTimer]);

  const handleStop = useCallback(async () => {
    if (!isRecording) { return; }
    stopTimer();
    setIsRecording(false);
    StatusBar.setHidden(false, 'fade');
    setUploading(true);
    try {
      const filePath = await stopScreenCapture();
      await saveReaction({
        userId: user!.id,
        threadId,
        filePath,
        duration: elapsedRef.current,
        mode: STORAGE_MODE,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.message ?? 'Could not save your reaction. Please try again.');
      setUploading(false);
    }
  }, [isRecording, stopTimer, user, threadId, navigation]);

  const handleRestart = useCallback(async () => {
    stopTimer();
    elapsedRef.current = 0;
    setElapsed(0);
    hasStartedRef.current = false;
    setIsRecording(false);
    setYtPlaying(false);
    StatusBar.setHidden(false, 'fade');
    await cancelScreenCapture().catch(() => {});
    await startScreenCapture().catch(() => {});
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
      if (skipNextPausedRef.current) {
        skipNextPausedRef.current = false;
      }
    } else if (state === 'ended') {
      setYtPlaying(false);
      skipNextPausedRef.current = false;
    }
  }, [beginRecording]);

  const handleEmoji = useCallback((emoji: string) => {
    const id = ++floatIdRef.current;
    setFloating(prev => [...prev, { id, emoji }]);
  }, []);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (!ready || !device) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoText}>
          {!ready ? 'Camera and microphone access required' : 'No front camera found'}
        </Text>
        {!ready && (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={{ height: topInset, backgroundColor: C.BLACK }} />

      {/* Top 30% — YouTube (no overlay, user plays directly) */}
      <View style={[styles.pane, { height: topH }]}>
        <YoutubePlayer
          key={ytKey}
          ref={ytRef}
          height={topH}
          width={width}
          videoId={videoId}
          play={ytPlaying}
          onChangeState={onYtStateChange}
          initialPlayerParams={YT_PARAMS}
          webViewStyle={YT_WV_STYLE}
        />
      </View>

      {/* Divider */}
      <View style={[styles.divider, isRecording && styles.dividerActive]} />

      {/* Bottom 70% — camera */}
      <View style={[styles.pane, { height: bottomH }]}>
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
        />

        {isRecording && (
          <View style={styles.recBadge}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>{fmt(elapsed)}</Text>
          </View>
        )}

        {/* Controls always visible */}
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

        {/* Floating emojis */}
        {floating.map(f => (
          <FloatingEmoji
            key={f.id}
            emoji={f.emoji}
            onDone={() => setFloating(prev => prev.filter(x => x.id !== f.id))}
          />
        ))}

        {/* Emoji drawer */}
        {!uploading && (
          <View style={styles.emojiDrawer}>
            {emojiOpen && (
              <View style={styles.emojiPicker}>
                {QUICK_EMOJIS.map(e => (
                  <TouchableOpacity key={e} onPress={() => handleEmoji(e)} hitSlop={4}>
                    <Text style={styles.emojiGlyph}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity
              style={styles.emojiToggle}
              onPress={() => setEmojiOpen(o => !o)}
              activeOpacity={0.8}>
              <Text style={styles.emojiToggleIcon}>{emojiOpen ? '✕' : '😊'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {uploading && (
          <View style={styles.uploadOverlay}>
            <ActivityIndicator color={C.WHITE} size="large" />
            <Text style={styles.uploadText}>Saving reaction…</Text>
          </View>
        )}
      </View>

      <View style={{ height: bottomInset, backgroundColor: C.BLACK }} />

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
  center: {
    flex: 1, backgroundColor: C.BLACK,
    alignItems: 'center', justifyContent: 'center', gap: SPACE.LG, padding: SPACE.XL,
  },
  pane: { overflow: 'hidden', backgroundColor: C.BLACK },
  divider: { height: 2, backgroundColor: C.BORDER },
  dividerActive: { backgroundColor: C.ACCENT_MID },
  recBadge: {
    position: 'absolute',
    top: SPACE.MD, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: SPACE.XS,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS,
    borderRadius: RADIUS.FULL,
  },
  recDot: { width: 8, height: 8, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_MID },
  recText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },
  controls: {
    position: 'absolute',
    left: 0, right: 0,
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
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', gap: SPACE.MD,
  },
  uploadText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  closeBtn: {
    position: 'absolute', right: SPACE.LG,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: C.WHITE, fontSize: 16, fontFamily: FONT.BODY_BOLD, lineHeight: 20 },
  infoText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, textAlign: 'center' },
  backBtn: { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG },
  backBtnText: { color: C.INK, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM },
  emojiDrawer: {
    position: 'absolute', right: SPACE.MD, bottom: 100,
    alignItems: 'center', gap: SPACE.SM,
  },
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
});
