import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import Video, { type VideoRef } from 'react-native-video';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { createThumbnail } from 'react-native-create-thumbnail';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { MAX_STUDIO_MS } from '../../../infrastructure/creatorStudio/recipe';
import GradientButton from '../components/GradientButton';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

const HANDLE_W = 18;
const STRIP_H = 56;
const THUMBS = 8;
const MIN_SEL_MS = 1000;       // can't trim below 1s
const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Set in/out on a clip (filmstrip + draggable handles), then bake the trim via the
// native exporter and hand the result to StudioDetails. Window is clamped to 180s.
export default function StudioTrimScreen({ route, navigation }: StudioStackScreenProps<'StudioTrim'>) {
  const { fileUri, durationSec } = route.params;
  const { top } = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const videoRef = useRef<VideoRef>(null);

  const [durationMs, setDurationMs] = useState((durationSec ?? 0) * 1000);
  const [inMs, setInMs] = useState(0);
  const [outMs, setOutMs] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);

  const stripW = winW - SPACE.LG * 2;
  const usableW = stripW - HANDLE_W * 2;            // track the handles travel along
  const msToX = useCallback((ms: number) => (durationMs ? (ms / durationMs) * usableW : 0), [durationMs, usableW]);
  const xToMs = useCallback((x: number) => (usableW ? (x / usableW) * durationMs : 0), [usableW, durationMs]);

  // Handle X positions (left of left-handle, left of right-handle) in shared values.
  const inX = useSharedValue(0);
  const outX = useSharedValue(0);

  // Seed window once we know the duration (from param or the player's onLoad).
  const seeded = useRef(false);
  useEffect(() => {
    if (!durationMs || seeded.current) { return; }
    seeded.current = true;
    const end = Math.min(durationMs, MAX_STUDIO_MS);
    setInMs(0); setOutMs(end);
    inX.value = 0; outX.value = msToX(end);
  }, [durationMs, msToX, inX, outX]);

  // Filmstrip thumbnails across the full source.
  useEffect(() => {
    if (!durationMs) { return; }
    let alive = true;
    (async () => {
      const out: string[] = [];
      for (let i = 0; i < THUMBS; i++) {
        const t = Math.floor((durationMs / THUMBS) * i) + 50;
        try { const { path } = await createThumbnail({ url: fileUri, timeStamp: t, format: 'jpeg' }); out.push(path); }
        catch { out.push(''); }
      }
      if (alive) { setThumbs(out); }
    })();
    return () => { alive = false; };
  }, [durationMs, fileUri]);

  // Receives raw handle X positions (px) from the UI thread and converts on the JS
  // thread — xToMs must NOT be called inside a worklet.
  const commit = useCallback((nextInX: number, nextOutX: number) => {
    const nextIn = xToMs(nextInX);
    const nextOut = xToMs(nextOutX);
    setInMs(nextIn); setOutMs(nextOut);
    videoRef.current?.seek(nextIn / 1000);
  }, [xToMs]);

  const maxX = usableW;
  const minGapX = msToX(MIN_SEL_MS);
  const maxGapX = durationMs ? Math.min(usableW, msToX(MAX_STUDIO_MS)) : usableW;

  const leftPan = useMemo(() => Gesture.Pan()
    .onChange((e) => {
      'worklet';
      let v = inX.value + e.changeX;
      if (v < 0) { v = 0; }
      if (v > outX.value - minGapX) { v = outX.value - minGapX; }
      if (v < outX.value - maxGapX) { v = outX.value - maxGapX; }   // keep window <= 180s
      inX.value = v;
    })
    .onEnd(() => { 'worklet'; runOnJS(commit)(inX.value, outX.value); }),
    [minGapX, maxGapX, commit, inX, outX]);

  const rightPan = useMemo(() => Gesture.Pan()
    .onChange((e) => {
      'worklet';
      let v = outX.value + e.changeX;
      if (v > maxX) { v = maxX; }
      if (v < inX.value + minGapX) { v = inX.value + minGapX; }
      if (v > inX.value + maxGapX) { v = inX.value + maxGapX; }
      outX.value = v;
    })
    .onEnd(() => { 'worklet'; runOnJS(commit)(inX.value, outX.value); }),
    [minGapX, maxGapX, maxX, commit, inX, outX]);

  const leftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: inX.value }] }));
  const rightStyle = useAnimatedStyle(() => ({ transform: [{ translateX: outX.value + HANDLE_W }] }));
  const selStyle = useAnimatedStyle(() => ({
    left: inX.value + HANDLE_W,
    width: Math.max(0, outX.value - inX.value),
  }));

  // Loop playback within the selected window.
  const onProgress = useCallback((p: { currentTime: number }) => {
    if (outMs && p.currentTime * 1000 >= outMs) { videoRef.current?.seek(inMs / 1000); }
  }, [inMs, outMs]);

  // Non-destructive: hand the trim window forward; the single native bake (trim +
  // filter) happens after the Looks step.
  const next = useCallback(() => {
    navigation.navigate('StudioFilter', {
      fileUri,
      durationSec: durationSec ?? Math.round(durationMs / 1000),
      trimStartMs: Math.round(inMs),
      trimEndMs: Math.round(outMs),
    });
  }, [navigation, fileUri, durationSec, durationMs, inMs, outMs]);

  const selSec = Math.round((outMs - inMs) / 1000);

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={C.INK} />
        </TouchableOpacity>
        <Text style={styles.title}>Trim</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.preview}>
        <Video
          ref={videoRef}
          source={{ uri: fileUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          repeat
          muted
          onLoad={(d) => { if (!durationMs && d.duration) { setDurationMs(Math.round(d.duration * 1000)); } }}
          onProgress={onProgress}
          progressUpdateInterval={200}
        />
      </View>

      <View style={styles.times}>
        <Text style={styles.timeTxt}>{fmt(inMs)}</Text>
        <Text style={styles.selTxt}>{selSec}s selected</Text>
        <Text style={styles.timeTxt}>{fmt(outMs)}</Text>
      </View>

      {/* Filmstrip + handles */}
      <View style={[styles.strip, { width: stripW }]}>
        <View style={styles.thumbRow}>
          {thumbs.length === 0
            ? <ActivityIndicator color={C.ACCENT} style={StyleSheet.absoluteFill} />
            : thumbs.map((t, i) => (
              t ? <Animated.Image key={i} source={{ uri: `file://${t}` }} style={styles.thumb} resizeMode="cover" />
                : <View key={i} style={[styles.thumb, { backgroundColor: C.SURFACE_2 }]} />
            ))}
        </View>

        <Animated.View pointerEvents="none" style={[styles.selection, selStyle]} />

        <GestureDetector gesture={leftPan}>
          <Animated.View style={[styles.handle, styles.handleLeft, leftStyle]}>
            <View style={styles.grip} />
          </Animated.View>
        </GestureDetector>
        <GestureDetector gesture={rightPan}>
          <Animated.View style={[styles.handle, styles.handleRight, rightStyle]}>
            <View style={styles.grip} />
          </Animated.View>
        </GestureDetector>
      </View>

      {selSec >= MAX_STUDIO_MS / 1000 && (
        <Text style={styles.capHint}>Max length is {MAX_STUDIO_MS / 1000}s.</Text>
      )}

      <View style={styles.footer}>
        <GradientButton label="Next" onPress={next} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.LG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.MD },
  title: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  preview: { flex: 1, borderRadius: RADIUS.MD, backgroundColor: '#000', overflow: 'hidden', marginBottom: SPACE.LG },
  times: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.SM },
  timeTxt: { color: C.MUTED, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.SM },
  selTxt: { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  strip: {
    height: STRIP_H, alignSelf: 'center', borderRadius: RADIUS.SM, backgroundColor: C.SURFACE,
    marginBottom: SPACE.MD,
  },
  thumbRow: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', borderRadius: RADIUS.SM, overflow: 'hidden', marginHorizontal: HANDLE_W },
  thumb: { flex: 1, height: '100%' },
  selection: {
    position: 'absolute', top: 0, bottom: 0, borderColor: C.ACCENT_HOT, borderTopWidth: 3, borderBottomWidth: 3,
  },
  handle: {
    position: 'absolute', top: 0, bottom: 0, width: HANDLE_W, backgroundColor: C.ACCENT_HOT,
    alignItems: 'center', justifyContent: 'center',
  },
  handleLeft: { left: 0, borderTopLeftRadius: RADIUS.SM, borderBottomLeftRadius: RADIUS.SM },
  handleRight: { left: 0, borderTopRightRadius: RADIUS.SM, borderBottomRightRadius: RADIUS.SM },
  grip: { width: 3, height: 20, borderRadius: 2, backgroundColor: C.WHITE },
  capHint: { color: C.WARNING, fontFamily: FONT.BODY, fontSize: FONT.SIZES.XS, textAlign: 'center', marginBottom: SPACE.SM },
  footer: { paddingBottom: SPACE.LG },
});
