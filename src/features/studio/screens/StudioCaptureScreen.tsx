import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, StatusBar, ActivityIndicator,
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
import type { StudioStackScreenProps } from '../../../app/navigation/types';

const MAX_SEC = MAX_STUDIO_MS / 1000; // 180s hard cap (auto-stop)

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// In-app studio camera. Records a portrait clip (720p/30fps, 2 Mbps, 180s cap) and
// hands the file to StudioDetails to publish — the same pipeline as an import.
export default function StudioCaptureScreen({ navigation }: StudioStackScreenProps<'StudioCapture'>) {
  const { top, bottom } = useSafeAreaInsets();
  const [facing, setFacing] = useState<'back' | 'front'>('front');
  const device = useCameraDevice(facing);
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1280, height: 720 } },
    { fps: 30 },
  ]);
  const targetFps = format ? Math.min(30, format.maxFps) : 30;
  const { hasPermission: hasCam, requestPermission: reqCam } = useCameraPermission();
  const { hasPermission: hasMic, requestPermission: reqMic } = useMicrophonePermission();

  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);

  const cameraRef = useRef<Camera>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const finishRef = useRef<((v: VideoFile) => void) | null>(null);
  const stopRef = useRef<() => void>(() => {});

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
      navigation.navigate('StudioTrim', { fileUri: uri, durationSec: elapsedRef.current });
    } catch (e: any) {
      Alert.alert('Recording', e?.message ?? 'Could not save the recording.');
    } finally {
      setBusy(false);
    }
  }, [recording, navigation]);
  stopRef.current = stop;

  const start = useCallback(() => {
    if (recording || !ready) { return; }
    elapsedRef.current = 0;
    setElapsed(0);
    cameraRef.current?.startRecording({
      fileType: 'mp4',
      onRecordingFinished: (v) => { finishRef.current?.(v); finishRef.current = null; },
      onRecordingError: () => {
        finishRef.current = null;
        setRecording(false); setBusy(false);
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        StatusBar.setHidden(false, 'fade');
      },
    });
    setRecording(true);
    StatusBar.setHidden(true, 'fade');
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= MAX_SEC) { stopRef.current(); } // hard 180s cap
    }, 1000);
  }, [recording, ready]);

  const importLibrary = useCallback(async () => {
    if (recording) { return; }
    try {
      const picked = await pickVideoFromLibrary();
      if (picked?.uri) {
        navigation.navigate('StudioTrim', { fileUri: picked.uri, durationSec: picked.durationSec });
      }
    } catch (e: any) { Alert.alert('Import', e?.message ?? 'Could not import a video.'); }
  }, [recording, navigation]);

  return (
    <View style={styles.container}>
      {device && ready ? (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          format={format}
          fps={targetFps}
          videoBitRate={2}
          isActive
          video
          audio
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          {__DEV__
            ? <Text style={styles.placeholderTxt}>Camera unavailable on simulator.{'\n'}Use “Upload” to test the publish flow.</Text>
            : <ActivityIndicator color={C.ACCENT} />}
        </View>
      )}

      {/* Top bar: close + flip */}
      <View style={[styles.topBar, { top: top + SPACE.SM }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="close" size={26} color={C.WHITE} />
        </TouchableOpacity>
        {recording
          ? <View style={styles.timerPill}><View style={styles.recDot} /><Text style={styles.timerTxt}>{fmt(elapsed)} / {fmt(MAX_SEC)}</Text></View>
          : <View />}
        <TouchableOpacity onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))} hitSlop={10} style={styles.iconBtn} disabled={recording}>
          <Ionicons name="camera-reverse-outline" size={26} color={recording ? C.SUBTLE : C.WHITE} />
        </TouchableOpacity>
      </View>

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

        <View style={styles.sideBtn} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
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
});
