import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing, interpolate,
} from 'react-native-reanimated';

// Drippy's googly eyes — a tiny animated pair that blinks and darts side to side, standing in for the
// 👀 emoji ("watching / waiting for your reaction"). Both eyes share one blink + dart so they move
// together like a real pair.
export default function DrippyEyes({ size = 12, color = '#fff' }: { size?: number; color?: string }) {
  const blink = useSharedValue(1);
  const dart = useSharedValue(0);
  useEffect(() => {
    blink.value = withRepeat(
      withSequence(withTiming(1, { duration: 1800 }), withTiming(0.12, { duration: 60 }), withTiming(1, { duration: 90 })),
      -1,
    );
    dart.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 900 }),
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [blink, dart]);

  const lid = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const pupilMove = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(dart.value, [0, 1], [-size * 0.12, size * 0.12]) }] }));

  const eye = { width: size, height: size, borderRadius: size / 2, backgroundColor: color };
  const pupilSize = size * 0.44;
  const pupil = { width: pupilSize, height: pupilSize, borderRadius: pupilSize / 2, backgroundColor: '#16091f' };

  return (
    <View style={[styles.row, { gap: Math.max(1.5, size * 0.16) }]}>
      <Reanimated.View style={[styles.eye, eye, lid]}>
        <Reanimated.View style={[pupil, pupilMove]} />
      </Reanimated.View>
      <Reanimated.View style={[styles.eye, eye, lid]}>
        <Reanimated.View style={[pupil, pupilMove]} />
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  eye: { alignItems: 'center', justifyContent: 'center' },
});
