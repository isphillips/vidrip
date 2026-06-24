import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C } from '../theme';

// The Account tab's slime, rendered inside a ring — used as the Account button in the shared top
// header. Mirrors the bottom-tab Account blob (star topper + droplet body + eyes). White by default;
// when `active` (you're on the Account screen) it lights up yellow AND breathes + blinks like the
// bottom-tab slime did when selected.
const YELLOW = '#FFD86B';
const IDLE = '#FFFFFF';

export default function AccountBlob({ size = 34, active = false, testID = 'nav-account-blob' }: { size?: number; active?: boolean; testID?: string }) {
  const tint = active ? YELLOW : IDLE;
  const live = useSharedValue(0);
  const blink = useSharedValue(1);

  useEffect(() => {
    if (!active) { live.value = 0; blink.value = 1; return; }
    live.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, true);
    blink.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2800 }),
        withTiming(0.1, { duration: 60 }),
        withTiming(1, { duration: 90 }),
      ),
      -1,
    );
  }, [active, live, blink]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -live.value * 1.2 }, { scaleY: 1 + live.value * 0.06 }],
  }));
  const lidStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));

  return (
    <View
      testID={testID}
      accessibilityLabel="Account"
      style={[
      styles.ring,
      { width: size, height: size, borderRadius: size / 2 },
      { borderColor: active ? 'rgba(255,216,107,0.7)' : 'rgba(255,255,255,0.35)' },
    ]}>
      <View style={styles.slime}>
        <Ionicons name="star" size={7} color={tint} style={styles.hat} />
        <Reanimated.View style={[styles.body, { backgroundColor: tint }, bodyStyle]}>
          <Reanimated.View style={[styles.eye, styles.eyeL, lidStyle]}><View style={styles.pupil} /></Reanimated.View>
          <Reanimated.View style={[styles.eye, styles.eyeR, lidStyle]}><View style={styles.pupil} /></Reanimated.View>
        </Reanimated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.SURFACE,
    borderWidth: 1.5,
  },
  slime: { width: 18, alignItems: 'center', justifyContent: 'flex-end' },
  hat: { marginBottom: -1 },
  body: {
    width: 18, height: 15,
    borderTopLeftRadius: 9, borderTopRightRadius: 9, borderBottomLeftRadius: 9, borderBottomRightRadius: 5,
  },
  eye: { position: 'absolute', top: 4, width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  eyeL: { left: 4 },
  eyeR: { right: 4 },
  pupil: { width: 2.4, height: 2.4, borderRadius: 1.2, backgroundColor: '#16091f' },
});
