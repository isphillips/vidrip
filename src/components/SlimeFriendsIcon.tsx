import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing, interpolate,
  type SharedValue,
} from 'react-native-reanimated';

// The Friends header button: a little Drippy blob with an even smaller friend beside it (both bob +
// blink), a heart floating above, and — when `active` (menu open) — a puff of bubbles, matching the
// bottom-tab slimes' select treatment.
const BIG = '#A05CFF';
const SMALL = '#FF4FA3';
const HEART = '#FF4FA3';

const BUBBLES = [{ x: -5, size: 3, delay: 0 }, { x: 5, size: 3.5, delay: 0.18 }, { x: 1, size: 2.5, delay: 0.36 }];
function Bubble({ burst, x, size, delay }: { burst: SharedValue<number>; x: number; size: number; delay: number }) {
  const st = useAnimatedStyle(() => {
    const v = Math.min(1, Math.max(0, (burst.value - delay) / (1 - delay)));
    const op = v <= 0 || v >= 1 ? 0 : (v < 0.3 ? v / 0.3 : 1 - (v - 0.3) / 0.7);
    return { opacity: op, transform: [{ translateX: x }, { translateY: -v * 12 }, { scale: 0.5 + v * 0.6 }] };
  });
  return <Reanimated.View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2 }, st]} pointerEvents="none" />;
}

export default function SlimeFriendsIcon({ size = 30, active = false }: { size?: number; active?: boolean }) {
  const bob = useSharedValue(0);
  const blink = useSharedValue(1);
  const burst = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true);
    blink.value = withRepeat(
      withSequence(withTiming(1, { duration: 2400 }), withTiming(0.1, { duration: 60 }), withTiming(1, { duration: 90 })),
      -1,
    );
  }, [bob, blink]);
  useEffect(() => {
    if (!active) { return; }
    burst.value = 0;
    burst.value = withTiming(1, { duration: 760, easing: Easing.out(Easing.quad) });
  }, [active, burst]);

  const bigStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(bob.value, [0, 1], [0, -1.6]) }] }));
  const smallStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(bob.value, [0, 1], [-1.6, 0]) }] }));
  const lid = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));

  const bigW = size * 0.6, bigH = size * 0.56;
  const smW = size * 0.4, smH = size * 0.38;
  const eye = size * 0.13, pup = eye * 0.55;
  const eyeStyle = { width: eye, height: eye, borderRadius: eye / 2, backgroundColor: '#fff', alignItems: 'center' as const, justifyContent: 'center' as const };
  const pupStyle = { width: pup, height: pup, borderRadius: pup / 2, backgroundColor: '#16091f' };

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {active && (
        <View style={styles.bubbleLayer} pointerEvents="none">
          {BUBBLES.map((b, i) => <Bubble key={i} burst={burst} x={b.x} size={b.size} delay={b.delay} />)}
        </View>
      )}

      {/* heart floating above the pair */}
      <View style={styles.heartLayer} pointerEvents="none">
        <Ionicons name="heart" size={Math.round(size * 0.3)} color={HEART} />
      </View>

      {/* smaller friend, behind-right */}
      <Reanimated.View style={[styles.small, smallStyle, {
        width: smW, height: smH, right: 0, bottom: size * 0.1,
        borderTopLeftRadius: smW * 0.5, borderTopRightRadius: smW * 0.5, borderBottomLeftRadius: smW * 0.35, borderBottomRightRadius: smW * 0.35,
        backgroundColor: SMALL,
      }]}>
        <Reanimated.View style={[eyeStyle, { marginTop: smH * 0.22 }, lid]}><View style={pupStyle} /></Reanimated.View>
      </Reanimated.View>

      {/* main Drippy, front-left */}
      <Reanimated.View style={[styles.big, bigStyle, {
        width: bigW, height: bigH, left: 0, bottom: 0,
        borderTopLeftRadius: bigW * 0.5, borderTopRightRadius: bigW * 0.5, borderBottomLeftRadius: bigW * 0.32, borderBottomRightRadius: bigW * 0.32,
        backgroundColor: BIG,
      }]}>
        <View style={styles.eyesRow}>
          <Reanimated.View style={[eyeStyle, lid]}><View style={pupStyle} /></Reanimated.View>
          <Reanimated.View style={[eyeStyle, lid]}><View style={pupStyle} /></Reanimated.View>
        </View>
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  big: { position: 'absolute', alignItems: 'center' },
  small: { position: 'absolute', alignItems: 'center' },
  eyesRow: { flexDirection: 'row', gap: 2, marginTop: '24%' },
  heartLayer: { position: 'absolute', top: -3, left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  bubbleLayer: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  bubble: { position: 'absolute', borderWidth: 1, borderColor: SMALL, backgroundColor: 'transparent' },
});
