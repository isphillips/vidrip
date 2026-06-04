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
import type { RecordStackScreenProps } from '../../../app/navigation/types';

const QUICK_EMOJIS = ['❤️', '😂', '😮', '🔥', '👏', '😭'];
const PIP_WIDTH = 110;
const PIP_HEIGHT = 170;

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
  emoji: { position: 'absolute', bottom: 160, alignSelf: 'center', fontSize: 36 },
});

type Phase = 'loading' | 'ready' | 'buffering' | 'recording' | 'uploading';

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

  const [permissionsReady, setPermissionsReady] = useState(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [elapsed, setElapsed] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [floating, setFloating] = useState<{ id: number; emoji: string }[]>([]);
  const floatIdRef = useRef(0);

  const cameraRef = useRef<Camera>(null);
  const ytRef = useRef<YoutubeIframeRef>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const isCancellingRef = useRef(false);
  const ytKeyRef = useRef(0);
  const [ytKey, setYtKey] = useState(0);
  const [ytPlaying, setYtPlaying] = useState(false);

  useEffect(() => {
    Orientation.lockToPortrait();
    return () => { Orientation.unlockAllOrientations(); };
  }, []);

  // Request cam + mic on mount
  useEffect(() => {
    (async () => {
      const cam = hasCam || (await requestCam());
      const mic = hasMic || (await requestMic());
      setPermissionsReady(cam && mic);
    })();
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); }
      isCancellingRef.current = true;
      cameraRef.current?.stopRecording().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    elapsedRef.current = 0;
    setElapsed(0);
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
  }, [stopTimer]);

  // Called when user taps "Tap to record" — starts both video and camera
  const handleTapToStart = useCallback(() => {
    if (phase !== 'ready') { return; }
    setPhase('buffering');
    isCancellingRef.current = false;
    setYtPlaying(true);
  }, [phase]);

  // YouTube state changes: buffering → playing triggers recording start
  const onYtStateChange = useCallback((state: string) => {
    if (state === 'playing' && (phase === 'buffering' || phase === 'ready')) {
      setPhase('recording');
      StatusBar.setHidden(true, 'fade');
      startTimer();

      const uid = user!.id;
      cameraRef.current?.startRecording({
        onRecordingFinished: async (video) => {
          if (isCancellingRef.current) {
            isCancellingRef.current = false;
            return;
          }
          setPhase('uploading');
          try {
            await saveReaction({
              userId: uid,
              threadId,
              filePath: video.path,
              duration: video.duration,
              mode: STORAGE_MODE,
            });
            navigation.goBack();
          } catch (e: any) {
            Alert.alert('Upload Failed', e?.message ?? 'Could not save your reaction. Please try again.');
            setPhase('recording');
          }
        },
        onRecordingError: (e) => {
          stopTimer();
          setPhase('ready');
          setYtPlaying(false);
          StatusBar.setHidden(false, 'fade');
          Alert.alert('Recording Error', e.message ?? 'Could not start recording.');
        },
      });
    } else if (state === 'buffering' && phase === 'buffering') {
      // Still buffering — keep spinner
    } else if (state === 'ended') {
      // Video finished — stop recording
      if (phase === 'recording') { handleStop(); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, startTimer, stopTimer, user, threadId, navigation]);

  const handleStop = useCallback(async () => {
    if (phase !== 'recording') { return; }
    stopTimer();
    setYtPlaying(false);
    StatusBar.setHidden(false, 'fade');
    try {
      await cameraRef.current?.stopRecording();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not stop recording.');
      setPhase('ready');
    }
  }, [phase, stopTimer]);

  const handleRestart = useCallback(async () => {
    stopTimer();
    setElapsed(0);
    elapsedRef.current = 0;
    setYtPlaying(false);
    StatusBar.setHidden(false, 'fade');
    isCancellingRef.current = true;
    try { await cameraRef.current?.stopRecording(); } catch {}
    ytKeyRef.current += 1;
    setYtKey(ytKeyRef.current);
    setPhase('ready');
  }, [stopTimer]);

  const handleEmoji = useCallback((emoji: string) => {
    const id = ++floatIdRef.current;
    setFloating(prev => [...prev, { id, emoji }]);
  }, []);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Permissions not ready yet
  if (!permissionsReady || !device) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoText}>
          {!permissionsReady ? 'Camera and microphone access required' : 'No front camera found'}
        </Text>
        {!permissionsReady && (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const pipBottom = bottomInset + SPACE.XL + 72; // above controls

  return (
    <View style={styles.container}>
      {/* Full screen YouTube Short */}
      <YoutubePlayer
        key={ytKey}
        ref={ytRef}
        height={height}
        width={width}
        videoId={videoId}
        play={ytPlaying}
        onChangeState={onYtStateChange}
        onReady={() => { if (phase === 'loading') { setPhase('ready'); } }}
        initialPlayerParams={{ rel: false, controls: false }}
        webViewStyle={{ backgroundColor: C.BLACK }}
      />

      {/* Camera PiP — bottom-left corner */}
      <View style={[styles.pip, { bottom: pipBottom, left: SPACE.MD }]}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          video={true}
          audio={true}
        />
        {phase === 'recording' && (
          <View style={styles.recDotWrap}>
            <View style={styles.recDot} />
          </View>
        )}
      </View>

      {/* Floating emojis */}
      {floating.map(f => (
        <FloatingEmoji
          key={f.id}
          emoji={f.emoji}
          onDone={() => setFloating(prev => prev.filter(x => x.id !== f.id))}
        />
      ))}

      {/* Overlay: loading spinner while YouTube initialises */}
      {phase === 'loading' && (
        <View style={styles.overlay}>
          <ActivityIndicator color={C.WHITE} size="large" />
          <Text style={styles.overlayText}>Loading…</Text>
        </View>
      )}

      {/* Overlay: buffering spinner after tap */}
      {phase === 'buffering' && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={C.WHITE} size="large" />
          <Text style={styles.overlayText}>Buffering…</Text>
        </View>
      )}

      {/* Overlay: uploading */}
      {phase === 'uploading' && (
        <View style={styles.overlay}>
          <ActivityIndicator color={C.WHITE} size="large" />
          <Text style={styles.overlayText}>Saving reaction…</Text>
        </View>
      )}

      {/* Tap to record CTA */}
      {phase === 'ready' && (
        <TouchableOpacity style={styles.ctaWrap} activeOpacity={0.85} onPress={handleTapToStart}>
          <View style={styles.ctaBtn}>
            <View style={styles.ctaDot} />
            <Text style={styles.ctaText}>Tap to record</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Recording controls */}
      {phase === 'recording' && (
        <View style={[styles.controls, { bottom: bottomInset + SPACE.LG }]}>
          <View style={styles.recTimer}>
            <View style={styles.recDotLarge} />
            <Text style={styles.recTimerText}>{fmt(elapsed)}</Text>
          </View>
          <TouchableOpacity style={styles.restartBtn} onPress={handleRestart} activeOpacity={0.8}>
            <Text style={styles.restartIcon}>↺</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.8}>
            <View style={styles.stopInner} />
          </TouchableOpacity>
        </View>
      )}

      {/* Emoji drawer */}
      {(phase === 'recording') && (
        <View style={[styles.emojiDrawer, { bottom: bottomInset + SPACE.LG, right: SPACE.MD }]}>
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

      {/* Close button */}
      {phase !== 'uploading' && phase !== 'recording' && (
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
  infoText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, textAlign: 'center' },
  backBtn: { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG },
  backBtnText: { color: C.INK, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM },

  pip: {
    position: 'absolute',
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
    borderRadius: RADIUS.LG,
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: C.WHITE,
  },
  recDotWrap: {
    position: 'absolute', top: SPACE.XS, right: SPACE.XS,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.ACCENT_MID,
  },
  recDot: { flex: 1 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', gap: SPACE.MD,
  },
  overlayText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },

  ctaWrap: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    alignItems: 'center',
    paddingBottom: 80,
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: SPACE.XL, paddingVertical: SPACE.MD,
    borderRadius: RADIUS.FULL,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
  },
  ctaDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: C.ACCENT_MID,
  },
  ctaText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD },

  controls: {
    position: 'absolute',
    left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACE.LG,
  },
  recTimer: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.XS,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS,
    borderRadius: RADIUS.FULL,
  },
  recDotLarge: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.ACCENT_MID },
  recTimerText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },
  restartBtn: {
    width: 52, height: 52, borderRadius: RADIUS.FULL,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  restartIcon: { color: C.WHITE, fontSize: 20 },
  stopBtn: {
    width: 68, height: 68, borderRadius: RADIUS.FULL,
    borderWidth: 4, borderColor: C.ACCENT_MID,
    alignItems: 'center', justifyContent: 'center',
  },
  stopInner: { width: 26, height: 26, borderRadius: RADIUS.SM, backgroundColor: C.ACCENT },

  emojiDrawer: {
    position: 'absolute',
    alignItems: 'center', gap: SPACE.XS,
  },
  emojiPicker: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: RADIUS.LG, padding: SPACE.SM,
    gap: SPACE.XS, alignItems: 'center',
    marginBottom: SPACE.XS,
  },
  emojiGlyph: { fontSize: 28 },
  emojiToggle: {
    width: 44, height: 44, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  emojiToggleIcon: { fontSize: 22 },

  closeBtn: {
    position: 'absolute', right: SPACE.LG,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: C.WHITE, fontSize: 16, fontFamily: FONT.BODY_BOLD, lineHeight: 20 },
});
