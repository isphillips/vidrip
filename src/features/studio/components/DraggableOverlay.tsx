import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C } from '../../../theme';

export type OverlayTransform = { tx: number; ty: number; scale: number; rotation: number };

// A draggable / pinch-to-scale / rotate overlay. Sits in its own full-screen, centered,
// box-none container so multiple overlays stack and empty space passes touches through.
export default function DraggableOverlay({
  selected, onSelect, onDelete, onChange, initial, children,
}: {
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onChange: (t: OverlayTransform) => void;
  initial: OverlayTransform;
  children: React.ReactNode;
}) {
  const tx = useSharedValue(initial.tx);
  const ty = useSharedValue(initial.ty);
  const scale = useSharedValue(initial.scale);
  const rot = useSharedValue(initial.rotation);
  const sTx = useSharedValue(initial.tx);
  const sTy = useSharedValue(initial.ty);
  const sScale = useSharedValue(initial.scale);
  const sRot = useSharedValue(initial.rotation);

  const commit = () => onChange({ tx: tx.value, ty: ty.value, scale: scale.value, rotation: rot.value });

  const pan = Gesture.Pan()
    .onBegin(() => { 'worklet'; runOnJS(onSelect)(); })
    .onChange((e) => { 'worklet'; tx.value = sTx.value + e.translationX; ty.value = sTy.value + e.translationY; })
    .onEnd(() => { 'worklet'; sTx.value = tx.value; sTy.value = ty.value; runOnJS(commit)(); });
  const pinch = Gesture.Pinch()
    .onChange((e) => { 'worklet'; scale.value = Math.max(0.2, sScale.value * e.scale); })
    .onEnd(() => { 'worklet'; sScale.value = scale.value; runOnJS(commit)(); });
  const rotate = Gesture.Rotation()
    .onChange((e) => { 'worklet'; rot.value = sRot.value + e.rotation; })
    .onEnd(() => { 'worklet'; sRot.value = rot.value; runOnJS(commit)(); });
  const gesture = Gesture.Simultaneous(pan, pinch, rotate);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value }, { translateY: ty.value },
      { scale: scale.value }, { rotateZ: `${rot.value}rad` },
    ],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="box-none">
      <GestureDetector gesture={gesture}>
        <Animated.View style={style}>
          <View style={selected ? styles.selected : styles.idle}>{children}</View>
          {selected && (
            <TouchableOpacity onPress={onDelete} style={styles.del} hitSlop={8}>
              <Ionicons name="close" size={14} color={C.WHITE} />
            </TouchableOpacity>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  idle: { padding: 6 },
  selected: { padding: 6, borderWidth: 1, borderColor: C.ACCENT_HOT, borderStyle: 'dashed', borderRadius: 8 },
  del: {
    position: 'absolute', top: -10, right: -10, width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.ACCENT, alignItems: 'center', justifyContent: 'center',
  },
});
