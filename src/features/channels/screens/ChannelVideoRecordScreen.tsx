import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import Orientation from 'react-native-orientation-locker';
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
import { postChannelClip } from '../../../infrastructure/supabase/queries/channels';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

export default function ChannelVideoRecordScreen({
  route,
  navigation,
}: ChannelsStackScreenProps<'ChannelVideoRecord'>) {
  const { channelId } = route.params;
  const { user } = useAuthStore();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();

  const device = useCameraDevice('front');
  const { hasPermission: hasCam, requestPermission: requestCam } = useCameraPermission();
  const { hasPermission: hasMic, requestPermission: requestMic } = useMicrophonePermission();

  const [ready, setReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);

  const cameraRef = useRef<Camera>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const recordingCallbackRef = useRef<((video: VideoFile) => void) | null>(null);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTimer = useCallback(() => {
    elapsedRef.current = 0;
    setElapsed(0);
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const handleStartRecord = useCallback(() => {
    cameraRef.current?.startRecording({
      fileType: 'mp4',
      onRecordingFinished: (video) => {
        recordingCallbackRef.current?.(video);
        recordingCallbackRef.current = null;
      },
      onRecordingError: (err) => {
        console.error('[ChannelVideoRecord] recording error:', err);
        recordingCallbackRef.current = null;
        setIsRecording(false);
        stopTimer();
      },
    });
    setIsRecording(true);
    StatusBar.setHidden(true, 'fade');
    startTimer();
  }, [startTimer, stopTimer]);

  const handleStop = useCallback(async () => {
    if (!isRecording || !user?.id) { return; }
    stopTimer();
    setIsRecording(false);
    StatusBar.setHidden(false, 'fade');
    setUploading(true);

    try {
      const video = await new Promise<VideoFile>((resolve, reject) => {
        recordingCallbackRef.current = resolve;
        cameraRef.current?.stopRecording().catch(reject);
      });

      await postChannelClip({
        channelId,
        userId: user.id,
        filePath: video.path,
        duration: video.duration,
      });

      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.message ?? 'Could not post your video.');
      setUploading(false);
    }
  }, [isRecording, user?.id, channelId, navigation, stopTimer]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (!ready || !device) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera and microphone access required</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        video={true}
        audio={true}
      />

      {/* Recording badge */}
      {isRecording && (
        <View style={[styles.badge, { top: topInset + SPACE.MD }]}>
          <View style={styles.recDot} />
          <Text style={styles.recText}>{fmt(elapsed)}</Text>
        </View>
      )}

      {/* Controls */}
      {!uploading && (
        <View style={[styles.controls, { bottom: bottomInset + SPACE.XL }]}>
          {isRecording ? (
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.8}>
              <View style={styles.stopInner} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.recordBtn} onPress={handleStartRecord} activeOpacity={0.8}>
              <View style={styles.recordInner} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Upload overlay */}
      {uploading && (
        <View style={styles.uploadOverlay}>
          <ActivityIndicator color={C.WHITE} size="large" />
          <Text style={styles.uploadText}>Posting video…</Text>
        </View>
      )}

      {/* Close button — hidden while recording */}
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
  permText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, textAlign: 'center' },
  backBtn: {
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD,
    paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG,
  },
  backBtnText: { color: C.INK, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM },
  badge: {
    position: 'absolute', alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: SPACE.XS,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS,
    borderRadius: RADIUS.FULL,
  },
  recDot: { width: 8, height: 8, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_HOT },
  recText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },
  controls: {
    position: 'absolute', left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  recordBtn: {
    width: 80, height: 80, borderRadius: RADIUS.FULL,
    borderWidth: 4, borderColor: C.WHITE,
    alignItems: 'center', justifyContent: 'center',
  },
  recordInner: {
    width: 60, height: 60, borderRadius: RADIUS.FULL,
    backgroundColor: C.ACCENT_HOT,
  },
  stopBtn: {
    width: 80, height: 80, borderRadius: RADIUS.FULL,
    borderWidth: 4, borderColor: C.ACCENT_MID,
    alignItems: 'center', justifyContent: 'center',
  },
  stopInner: {
    width: 30, height: 30, borderRadius: RADIUS.SM,
    backgroundColor: C.ACCENT_HOT,
  },
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
});
