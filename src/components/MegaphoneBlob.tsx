/* eslint-disable react-native/no-inline-styles */
import React, { useContext, useEffect } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing, interpolate,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import BlobBase, { BlinkContext } from './blobEmoji/BlobBase';
import { Arc, INK } from './blobEmoji/faces';
import { C } from '../theme';

// Drippy's town-crier: a little purple slime blob hoisting a big megaphone, radiating sound rings.
// Composition sits in the LOWER-LEFT half of the avatar circle — the megaphone bell + its noise point
// up-and-to-the-left so they clear the unread badge that lives in the top-right corner of the row.
// Used in the Feed as the "new videos to react to" channel icon. Decorative only — pointerEvents is
// off so taps fall through to the row.

const RING = 48;          // avatar circle (matches ConversationRow's fallback)
const BLOB = 24;          // the little body
const MEG = 32;           // the big megaphone

// A cute eye — white sclera, dark pupil, tiny shine. Blinks with the blob (BlinkContext).
function Eye({ cx, cy, d }: { cx: number; cy: number; d: number }) {
  const blink = useContext(BlinkContext);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleY: blink ? 1 - blink.value * 0.85 : 1 }] }));
  return (
    <Animated.View
      style={[{
        position: 'absolute', left: cx - d / 2, top: cy - d / 2, width: d, height: d, borderRadius: d / 2,
        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
      }, st]}
      pointerEvents="none">
      <View style={{ width: d * 0.52, height: d * 0.52, borderRadius: d * 0.26, backgroundColor: INK }} />
      <View style={{ position: 'absolute', top: d * 0.18, left: d * 0.22, width: d * 0.22, height: d * 0.22, borderRadius: d * 0.11, backgroundColor: 'rgba(255,255,255,0.95)' }} />
    </Animated.View>
  );
}

// An expanding ring pulsing out of the megaphone bell, then fading — a few staggered phases read as a
// continuous "broadcast". Own loop, independent of the blob's breathe.
function SoundPulse({ cx, cy, size, phase, color }: { cx: number; cy: number; size: number; phase: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      Math.round(phase * 1200),
      withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, [t, phase]);
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 1], [0, 0.85, 0]),
    transform: [{ scale: interpolate(t.value, [0, 1], [0.3, 1.5]) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size,
        borderRadius: size / 2, borderWidth: Math.max(1.5, size * 0.16), borderColor: color,
      }, st]}
    />
  );
}

// The oversized megaphone (brand-magenta bell, dark outline behind for contrast). Mirrored so the bell
// opens up-and-to-the-left; gives a little excited "shout" wobble on a gentle loop.
function Megaphone() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [t]);
  const st = useAnimatedStyle(() => ({
    transform: [{ scaleX: -1 }, { rotate: `${t.value * 7}deg` }, { scale: 1 + t.value * 0.06 }],
  }));
  return (
    <Animated.View style={[styles.meg, st]} pointerEvents="none">
      <Ionicons name="megaphone" size={MEG} color="#33135E" style={{ position: 'absolute', left: 1.4, top: 1.4 }} />
      <Ionicons name="megaphone" size={MEG} color={C.ACCENT_HOT} style={{ position: 'absolute', left: 0, top: 0 }} />
    </Animated.View>
  );
}

export default function MegaphoneBlob({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.ring, style]} pointerEvents="none">
      {/* sound rings off the bell (upper-left, clear of the badge) — on-brand magenta → light purple */}
      <SoundPulse cx={12} cy={13} size={18} phase={0} color={C.ACCENT_HOT} />
      <SoundPulse cx={12} cy={13} size={18} phase={0.33} color={C.ACCENT_OUTLINE} />
      <SoundPulse cx={12} cy={13} size={18} phase={0.66} color="rgba(255,255,255,0.85)" />

      {/* big megaphone, upper-left */}
      <Megaphone />

      {/* little nub-hand bridging the blob to the megaphone handle */}
      <View style={styles.hand} />

      {/* little blob, lower-right */}
      <View style={styles.blobPos}>
        <BlobBase size={BLOB} colors={['#9B6CFF', '#6C3CE0']} variant="pop">
          {({ w, h }) => (
            <>
              <Eye cx={w * 0.36} cy={h * 0.42} d={w * 0.27} />
              <Eye cx={w * 0.64} cy={h * 0.42} d={w * 0.27} />
              <Arc cx={w * 0.5} cy={h * 0.62} w={w * 0.26} h={h * 0.12} thick={Math.max(1.5, w * 0.06)} ink="#fff" dir="down" />
            </>
          )}
        </BlobBase>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches the row's avatar-fallback circle (ACCENT_LITE fill + ACCENT ring) so it sits flush
  // beside the friend/group avatars.
  ring: {
    width: RING, height: RING, borderRadius: RING / 2,
    backgroundColor: C.ACCENT_LITE, borderWidth: 2, borderColor: C.ACCENT,
    overflow: 'hidden',
  },
  meg: { position: 'absolute', left: 2, top: 4, width: MEG, height: MEG },
  hand: {
    position: 'absolute', left: 24, top: 26, width: 9, height: 9, borderRadius: 4.5,
    backgroundColor: '#9B6CFF', borderWidth: 1.5, borderColor: '#33135E',
  },
  blobPos: { position: 'absolute', left: 22, top: 20, width: BLOB, height: BLOB },
});
