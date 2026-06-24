import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, StyleSheet, Animated, Dimensions,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmojiGlyph from './EmojiGlyph';
import { C, RADIUS, SPACE, FONT } from '../theme';

export type ReactionMenuAction = { label: string; destructive?: boolean; onPress: () => void };

// iOS-Messages-style reaction menu. Long-press the content → the backdrop dims, a lifted copy of the
// content floats over it, and a single-line scrollable bar of (blob) emojis appears above/below it. A
// normal tap still runs `onPress`. No "+" affordance — the long-press IS the picker.
type Rect = { x: number; y: number; w: number; h: number };

export default function ReactionMenu({
  emojis, mine = [], onPick, onPress, actions, children, style, disabled = false,
}: {
  emojis: string[];
  mine?: string[];                 // emojis I've already reacted with (highlighted in the bar)
  onPick: (emoji: string) => void;
  onPress?: () => void;            // normal tap action (e.g. open the post)
  actions?: ReactionMenuAction[];  // optional context actions (e.g. Delete) shown below the preview
  children: React.ReactNode;       // the content; also re-rendered as the lifted preview
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const ref = useRef<View>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [open, setOpen] = useState(false);
  const prog = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const { height: screenH, width: screenW } = Dimensions.get('window');

  const close = useCallback(() => {
    Animated.timing(prog, { toValue: 0, duration: 130, useNativeDriver: true }).start(({ finished }) => {
      if (finished) { setOpen(false); setRect(null); }
    });
  }, [prog]);

  const openMenu = useCallback(() => {
    if (disabled) { return; }
    ref.current?.measureInWindow((x, y, w, h) => {
      if (!w || !h) { return; }
      setRect({ x, y, w, h });
      setOpen(true);
      prog.setValue(0);
      Animated.spring(prog, { toValue: 1, useNativeDriver: true, damping: 15, stiffness: 220 }).start();
    });
  }, [disabled, prog]);

  // Place the bar above the content if there's room, else below.
  const BAR_H = 58;
  const placeAbove = !!rect && rect.y - insets.top - 16 > BAR_H;
  const barTop = rect
    ? (placeAbove
        ? rect.y - BAR_H - 10
        : Math.min(screenH - insets.bottom - BAR_H - 10, rect.y + rect.h + 10))
    : 0;
  // Context actions sit below the preview (and below the bar if the bar had to go below too).
  const actionsTop = rect ? (placeAbove ? rect.y + rect.h + 12 : barTop + BAR_H + 10) : 0;

  const previewStyle = {
    opacity: prog.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
    transform: [{ scale: prog.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
  };
  const barStyle = {
    opacity: prog,
    transform: [
      { translateY: prog.interpolate({ inputRange: [0, 1], outputRange: [placeAbove ? 10 : -10, 0] }) },
      { scale: prog.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
    ],
  };

  return (
    <>
      <Pressable
        ref={ref}
        style={style}
        onPress={onPress}
        onLongPress={openMenu}
        delayLongPress={280}>
        {children}
      </Pressable>

      <Modal visible={open} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: prog }]} />
        </Pressable>

        {rect && (
          <>
            {/* Lifted copy of the content — carries the same container `style` (bg/border/padding) as the
                inline card so the floating preview reads identically, just lifted. */}
            <Animated.View
              pointerEvents="none"
              style={[style, { position: 'absolute', top: rect.y, left: rect.x, width: rect.w }, styles.preview, previewStyle]}>
              {children}
            </Animated.View>

            {/* Single-line scrollable reaction bar. */}
            <Animated.View style={[styles.barWrap, { top: barTop }, barStyle]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[styles.bar, { maxWidth: screenW - SPACE.LG * 2 }]}
                contentContainerStyle={styles.barContent}>
                {emojis.map(e => (
                  <View key={e} style={[styles.barItem, mine.includes(e) && styles.barItemMine]}>
                    <EmojiGlyph emoji={e} size={34} onPress={() => { onPick(e); close(); }} />
                  </View>
                ))}
              </ScrollView>
            </Animated.View>

            {/* Optional context actions (Delete, …) below the preview. */}
            {actions && actions.length > 0 && (
              <Animated.View style={[styles.actionsWrap, { top: actionsTop }, barStyle]}>
                <View style={styles.actions}>
                  {actions.map((a, i) => (
                    <Pressable
                      key={a.label}
                      onPress={() => { a.onPress(); close(); }}
                      style={[styles.action, i > 0 && styles.actionDivider]}>
                      <Text style={[styles.actionText, a.destructive && styles.actionDestructive]}>{a.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </Animated.View>
            )}
          </>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  // Drop shadow so the lifted card stands off the dimmed backdrop.
  preview: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  barWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: {
    flexGrow: 0,
    backgroundColor: C.SURFACE_2,
    borderRadius: RADIUS.FULL,
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  barContent: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM,
    flexGrow: 1, justifyContent: 'center',
  },
  barItem: { borderRadius: RADIUS.FULL, padding: 3 },
  barItemMine: { backgroundColor: C.ACCENT_LITE },
  actionsWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  actions: {
    backgroundColor: C.SURFACE_2,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
    minWidth: 180,
    overflow: 'hidden',
  },
  action: { paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG, alignItems: 'center' },
  actionDivider: { borderTopWidth: 1, borderTopColor: C.BORDER },
  actionText: { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },
  actionDestructive: { color: '#FF5A4D' },
});
