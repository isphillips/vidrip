import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, Alert, StatusBar,
} from 'react-native';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  type VideoFile,
} from 'react-native-vision-camera';
import Orientation from 'react-native-orientation-locker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchChannelPost,
  postChannelClip,
} from '../../../infrastructure/supabase/queries/channels';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

const YT_PARAMS = { rel: false as const, controls: true as const };
const YT_WV_STYLE = { backgroundColor: '#000000' };

export default function WatchYouTubePostScreen({
  route, navigation,
}: ChannelsStackScreenProps<'WatchYouTubePost'>) {
  const { postId, channelId } = route.params;
  const { user } = useAuthStore();
  const { width, height } = useWindowDimensions();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();

  const usableH = height - topInset - bottomInset;
  const topH = Math.round(usableH * 0.30);
  const bottomH = usableH - topH;

  const device = useCameraDevice('front');
  const { hasPermission: hasCam, requestPermission: requestCam } = useCameraPermission();
  const { hasPermission: hasMic, requestPermission: requestMic } = useMicrophonePermission();
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<Camera>(null);

  const [ytVideoId, setYtVideoId] = useState<string | null>(null);
  const [ytPlaying, setYtPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);

  const ytRef = useRef<YoutubeIframeRef>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const recordingCallbackRef = useRef<((v: VideoFile) => void) | null>(null);

  useEffect(() => {
    Orientation.lockToPortrait();
    return () => { Orientation.unlockAllOrientations(); };
  }, []);

  useEffect(() => {
    fetchChannelPost(postId).then(p => {
      setYtVideoId(p?.yt_video_id ?? null);
    });
  }, [postId]);

  useEffect(() => {
    (async () => {
      const cam = hasCam || (await requestCam());
      const mic = hasMic || (await requestMic());
      setCameraReady(cam && mic && !!device);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTimer = useCallback(() => {
    elapsedRef.current = 0; setElapsed(0);
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1; setElapsed(elapsedRef.current);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const handleStartRecord = useCallback(() => {
    cameraRef.current?.startRecording({
      fileType: 'mp4',
      onRecordingFinished: (video) => { recordingCallbackRef.current?.(video); recordingCallbackRef.current = null; },
      onRecordingError: () => { recordingCallbackRef.current = null; setIsRecording(false); stopTimer(); StatusBar.setHidden(false, 'fade'); },
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
        parentPostId: postId,  // links reaction to this YouTube post
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.message ?? 'Could not post your reaction.');
      setUploading(false);
    }
  }, [isRecording, user?.id, channelId, postId, navigation, stopTimer]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (!ytVideoId) {
    return <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={{ height: topInset, backgroundColor: C.BLACK }} />

      {/* Top 30% — YouTube */}
      <View style={[styles.pane, { height: topH }]}>
        <YoutubePlayer
          ref={ytRef}
          height={topH} width={width}
          videoId={ytVideoId}
          play={ytPlaying}
          onChangeState={s => { if (s === 'playing') { setYtPlaying(true); } }}
          initialPlayerParams={YT_PARAMS}
          webViewStyle={YT_WV_STYLE}
        />
        {!ytPlaying && (
          <TouchableOpacity style={styles.ytOverlay} onPress={() => setYtPlaying(true)} activeOpacity={0.85}>
            <View style={styles.ytPlayCircle}>
              <Text style={styles.ytPlayIcon}>▶</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.divider, isRecording && styles.dividerActive]} />

      {/* Bottom 70% — camera */}
      <View style={[styles.pane, { height: bottomH }]}>
        {cameraReady && device ? (
          <>
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={true}
              video={true}
              audio={true}
            />
            {isRecording && (
              <View style={styles.recBadge}>
                <View style={styles.recDot} />
                <Text style={styles.recText}>{fmt(elapsed)}</Text>
              </View>
            )}
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
            {uploading && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color={C.WHITE} size="large" />
                <Text style={styles.uploadText}>Posting reaction…</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={C.ACCENT_HOT} />
            <Text style={styles.permText}>Camera access required</Text>
          </View>
        )}
      </View>

      <View style={{ height: bottomInset, backgroundColor: C.BLACK }} />

      {!isRecording && !uploading && (
        <TouchableOpacity style={[styles.closeBtn, { top: topInset + SPACE.SM }]} onPress={() => navigation.goBack()}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BLACK },
  center: { flex: 1, backgroundColor: C.BLACK, alignItems: 'center', justifyContent: 'center', gap: SPACE.SM },
  pane: { overflow: 'hidden', backgroundColor: C.BLACK },
  divider: { height: 2, backgroundColor: C.BORDER },
  dividerActive: { backgroundColor: C.ACCENT_MID },
  ytOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  ytPlayCircle: { width: 52, height: 52, borderRadius: RADIUS.FULL, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  ytPlayIcon: { color: C.WHITE, fontSize: 20, marginLeft: 4 },
  recBadge: { position: 'absolute', top: SPACE.MD, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: SPACE.XS, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS, borderRadius: RADIUS.FULL },
  recDot: { width: 8, height: 8, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_HOT },
  recText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },
  controls: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  recordBtn: { width: 72, height: 72, borderRadius: RADIUS.FULL, borderWidth: 4, borderColor: C.WHITE, alignItems: 'center', justifyContent: 'center' },
  recordInner: { width: 54, height: 54, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT_HOT },
  stopBtn: { width: 72, height: 72, borderRadius: RADIUS.FULL, borderWidth: 4, borderColor: C.ACCENT_MID, alignItems: 'center', justifyContent: 'center' },
  stopInner: { width: 28, height: 28, borderRadius: RADIUS.SM, backgroundColor: C.ACCENT_HOT },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', gap: SPACE.MD },
  uploadText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  permText: { color: C.MUTED, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  closeBtn: { position: 'absolute', right: SPACE.LG, width: 36, height: 36, borderRadius: RADIUS.FULL, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: C.WHITE, fontSize: 16, fontFamily: FONT.BODY_BOLD, lineHeight: 20 },
});
