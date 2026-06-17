import React, { useEffect } from 'react';
import { StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';

export type PipBounds = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * The selfie PIP while recording a reaction: drag it anywhere inside `bounds` (clamped to the
 * top-left corner of the PIP), and fade it semi-transparent while recording so the source video
 * shows through. Bounds are computed by the parent per source type — e.g. IG/TikTok exclude the
 * right-edge strip where those apps draw their like/comment/share icons.
 */
export default function DraggablePip({
  width, height, startX, startY, bounds, recording, dimWhileRecording = true, style, children,
}: {
  width: number;
  height: number;
  startX: number;
  startY: number;
  bounds: PipBounds;
  recording: boolean;
  dimWhileRecording?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const tx = useSharedValue(startX);
  const ty = useSharedValue(startY);
  const baseX = useSharedValue(startX);
  const baseY = useSharedValue(startY);
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withTiming(recording && dimWhileRecording ? 0.6 : 1, { duration: 250 });
  }, [recording, dimWhileRecording, opacity]);

  const pan = Gesture.Pan()
    .onStart(() => {
      baseX.value = tx.value;
      baseY.value = ty.value;
    })
    .onUpdate((e) => {
      const nx = baseX.value + e.translationX;
      const ny = baseY.value + e.translationY;
      tx.value = Math.min(Math.max(nx, bounds.minX), bounds.maxX);
      ty.value = Math.min(Math.max(ny, bounds.minY), bounds.maxY);
    });

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.base, { width, height }, style, aStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  base: { position: 'absolute', left: 0, top: 0 },
});
