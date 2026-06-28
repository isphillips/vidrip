import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import EmojiGlyph from '../../../components/EmojiGlyph';
import { C, RADIUS } from '../../../theme';

export type RailBounds = { minX: number; maxX: number; minY: number; maxY: number };

export const RAIL_W = 54;
const HANDLE_H = 22;
const ITEM = 52;
const VISIBLE = 3;                                 // emojis shown before the strip scrolls
export const RAIL_H = HANDLE_H + VISIBLE * ITEM;   // total draggable height

/**
 * The reaction emoji launcher: a vertical strip of quick emojis the reactor taps to throw onto the
 * fountain. Draggable by the grip handle at the top (the strip below still scrolls + taps normally —
 * the pan lives only on the handle, so it never fights the inner ScrollView). Clamped to `bounds`.
 */
export default function DraggableEmojiRail({
  emojis, startX, startY, bounds, onThrow,
}: {
  emojis: readonly string[];
  startX: number;
  startY: number;
  bounds: RailBounds;
  onThrow: (emoji: string) => void;
}) {
  const tx = useSharedValue(startX);
  const ty = useSharedValue(startY);
  const baseX = useSharedValue(startX);
  const baseY = useSharedValue(startY);

  const pan = Gesture.Pan()
    .onStart(() => {
      baseX.value = tx.value;
      baseY.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = Math.min(Math.max(baseX.value + e.translationX, bounds.minX), bounds.maxX);
      ty.value = Math.min(Math.max(baseY.value + e.translationY, bounds.minY), bounds.maxY);
    });

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  return (
    <Animated.View style={[styles.wrap, aStyle]}>
      {/* Grip handle — the only draggable part, so the list below scrolls/taps unhindered. */}
      <GestureDetector gesture={pan}>
        <View style={styles.handle}>
          <View style={styles.grip} />
          <View style={styles.grip} />
        </View>
      </GestureDetector>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {emojis.map((e) => (
          <View key={e} style={styles.item}>
            <EmojiGlyph emoji={e} size={38} onPress={() => onThrow(e)} />
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 0, top: 0,
    width: RAIL_W, height: RAIL_H,
    borderRadius: RADIUS.LG, backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', overflow: 'hidden',
  },
  handle: {
    height: HANDLE_H, alignItems: 'center', justifyContent: 'center', gap: 3,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  grip: { width: 18, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.45)' },
  content: { paddingVertical: 2, alignItems: 'center' },
  item: { width: ITEM, height: ITEM, alignItems: 'center', justifyContent: 'center' },
});
