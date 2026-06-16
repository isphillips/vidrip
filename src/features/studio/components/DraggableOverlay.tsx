import React, { useState } from 'react';
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

  // While a gesture is active we rasterize the (often animated, multi-View) sticker subtree to a
  // single GPU texture on Android, so dragging/pinching is a cheap texture blit instead of
  // re-compositing every particle View each frame. `active` ref-counts the simultaneous gestures so
  // the flag clears only when the last one ends. iOS doesn't need it (renderToHardwareTextureAndroid
  // is a no-op there) and isn't laggy.
  const active = useSharedValue(0);
  const [dragging, setDragging] = useState(false);
  const begin = () => { 'worklet'; active.value += 1; if (active.value === 1) { runOnJS(setDragging)(true); } };
  const finish = () => { 'worklet'; active.value -= 1; if (active.value <= 0) { active.value = 0; runOnJS(setDragging)(false); } };

  const pan = Gesture.Pan()
    .onBegin(() => { 'worklet'; begin(); runOnJS(onSelect)(); })
    .onChange((e) => { 'worklet'; tx.value = sTx.value + e.translationX; ty.value = sTy.value + e.translationY; })
    .onEnd(() => { 'worklet'; sTx.value = tx.value; sTy.value = ty.value; runOnJS(commit)(); })
    .onFinalize(finish);
  const pinch = Gesture.Pinch()
    .onBegin(begin)
    .onChange((e) => { 'worklet'; scale.value = Math.max(0.2, sScale.value * e.scale); })
    .onEnd(() => { 'worklet'; sScale.value = scale.value; runOnJS(commit)(); })
    .onFinalize(finish);
  const rotate = Gesture.Rotation()
    .onBegin(begin)
    .onChange((e) => { 'worklet'; rot.value = sRot.value + e.rotation; })
    .onEnd(() => { 'worklet'; sRot.value = rot.value; runOnJS(commit)(); })
    .onFinalize(finish);
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
        <Animated.View style={style} renderToHardwareTextureAndroid={dragging} collapsable={false}>
          <View style={selected ? styles.selected : styles.idle}>{children}</View>
          {selected && !dragging && (
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
