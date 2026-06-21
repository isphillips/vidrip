import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing as ReEasing,
} from 'react-native-reanimated';
import { C, RADIUS } from '../../theme';

// Gold "exclusive drop" glow — a continuously breathing halo behind a conversation row,
// mirroring the Studio FAB glow in MainTabBar (GlowFab). Wraps any row content; when
// `active` is false it renders children untouched (no animation cost).
export default function ExclusiveGlow({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!active) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: ReEasing.inOut(ReEasing.quad) }),
      -1,
      true,
    );
  }, [active, pulse]);

  // Outer halo blooms + fades; inner halo holds a soft steady glow — together they "breathe".
  const haloOut = useAnimatedStyle(() => ({
    opacity: 0.22 - pulse.value * 0.16,
    transform: [{ scaleX: 1 + pulse.value * 0.02 }, { scaleY: 1 + pulse.value * 0.18 }],
  }));
  const haloIn = useAnimatedStyle(() => ({ opacity: 0.16 + pulse.value * 0.14 }));

  if (!active) return <>{children}</>;

  return (
    <View style={styles.wrap}>
      <Reanimated.View style={[styles.haloOut, haloOut]} pointerEvents="none" />
      <Reanimated.View style={[styles.haloIn, haloIn]} pointerEvents="none" />
      <View style={styles.border}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  haloOut: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.GOLD_REAL,
    borderRadius: RADIUS.MD,
  },
  haloIn: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.GOLD_REAL,
    borderRadius: RADIUS.MD,
  },
  border: {
    borderLeftWidth: 3,
    borderLeftColor: C.GOLD_REAL,
  },
});
