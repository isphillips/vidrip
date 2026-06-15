import React, { useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle, useSharedValue, runOnJS, withTiming, withRepeat, interpolate,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { C, FONT, SPACE } from '../../../theme';

const BRAND = ['#FF4FA3', '#A05CFF', '#3B82F6'];
const KNOB = 26;

// Branded gradient slider — glowing knob that swells on grab, a pulsing sonar ring,
// and a value bubble. value/min/max in real units; onChange fires while dragging.
export default function Slider({
  label, value, min, max, onChange, onScrubStart, onScrubEnd, format = (v: number) => v.toFixed(1),
}: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; onScrubStart?: () => void; onScrubEnd?: () => void;
  format?: (v: number) => string;
}) {
  const { width: winW } = useWindowDimensions();
  const trackW = winW - SPACE.LG * 2 - KNOB;
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const active = useSharedValue(0);
  const pulse = useSharedValue(0);

  const toX = (v: number) => Math.max(0, Math.min(trackW, ((v - min) / (max - min)) * trackW));

  useEffect(() => { x.value = toX(value); }, [value, trackW]); // eslint-disable-line
  useEffect(() => { pulse.value = withRepeat(withTiming(1, { duration: 1100 }), -1, false); }, [pulse]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      start.value = x.value;
      active.value = withTiming(1, { duration: 140 });
      if (onScrubStart) { runOnJS(onScrubStart)(); }
    })
    .onChange((e) => {
      'worklet';
      let v = start.value + e.translationX;
      if (v < 0) { v = 0; }
      if (v > trackW) { v = trackW; }
      x.value = v;
      // inline (min + (v/trackW)*(max-min)) — no JS-function call inside the worklet
      runOnJS(onChange)(min + (v / trackW) * (max - min));
    })
    .onFinalize(() => {
      'worklet';
      active.value = withTiming(0, { duration: 240 });
      if (onScrubEnd) { runOnJS(onScrubEnd)(); }
    });

  const fillStyle = useAnimatedStyle(() => ({ width: x.value + KNOB / 2 }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scale: interpolate(active.value, [0, 1], [1, 1.4]) }],
  }));
  const glowStyle = useAnimatedStyle(() => {
    const breathe = 1 + interpolate(pulse.value, [0, 0.5, 1], [0, 0.25, 0]) * active.value;
    return {
      transform: [{ translateX: x.value - (KNOB + 20 - KNOB) / 2 }, { scale: (0.6 + active.value * 0.9) * breathe }],
      opacity: interpolate(active.value, [0, 1], [0.2, 0.85]),
    };
  });
  // Sonar ring: expands + fades repeatedly while active.
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - (44 - KNOB) / 2 }, { scale: interpolate(pulse.value, [0, 1], [0.7, 2]) }],
    opacity: active.value * interpolate(pulse.value, [0, 1], [0.55, 0]),
  }));
  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - 12 }, { translateY: interpolate(active.value, [0, 1], [4, -8]) }, { scale: interpolate(active.value, [0, 1], [0.8, 1]) }],
    opacity: active.value,
  }));

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <GestureDetector gesture={pan}>
        <View style={styles.track}>
          <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rail} />
          <Animated.View style={[styles.fillClip, fillStyle]}>
            <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fillGrad, { width: trackW + KNOB }]} />
          </Animated.View>
          <Animated.View style={[styles.ring, ringStyle]} />
          <Animated.View style={[styles.glow, glowStyle]} />
          <Animated.View style={[styles.knob, knobStyle]}>
            <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.knobGrad}>
              <View style={styles.knobCore} />
            </LinearGradient>
          </Animated.View>
          <Animated.View style={[styles.bubble, bubbleStyle]} pointerEvents="none">
            <Text style={styles.bubbleTxt}>{format(value)}</Text>
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: SPACE.MD },
  label: { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.XS, marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase' },
  track: { height: KNOB + 4, justifyContent: 'center' },
  rail: { height: 7, borderRadius: 4, opacity: 0.25, marginHorizontal: KNOB / 2 },
  fillClip: { position: 'absolute', left: KNOB / 2, height: 7, borderRadius: 4, overflow: 'hidden' },
  fillGrad: { height: 7, borderRadius: 4 },
  ring: {
    position: 'absolute', left: 0, width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: C.ACCENT_HOT,
  },
  glow: {
    position: 'absolute', left: 0, width: KNOB + 20, height: KNOB + 20, borderRadius: (KNOB + 20) / 2,
    backgroundColor: C.ACCENT_HOT,
  },
  knob: {
    position: 'absolute', left: 0, width: KNOB, height: KNOB, borderRadius: KNOB / 2,
    shadowColor: C.ACCENT_HOT, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  knobGrad: { flex: 1, borderRadius: KNOB / 2, alignItems: 'center', justifyContent: 'center' },
  knobCore: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: C.WHITE },
  bubble: {
    position: 'absolute', left: 0, bottom: KNOB + 8, minWidth: 50, paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 9, backgroundColor: C.SURFACE_2, borderWidth: 1, borderColor: C.ACCENT_HOT, alignItems: 'center',
  },
  bubbleTxt: { color: C.INK, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.XS },
});
