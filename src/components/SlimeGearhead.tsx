import React, { useEffect } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, interpolate,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C } from '../theme';

// A pocket-sized Drippy whose HEAD is a cog — our "gearhead" mascot for settings. Idle: a gentle bob +
// a slowly turning gear. `active` (e.g. its menu open) spins the gear fast and tints it hot-pink, so it
// drops in for a settings cog while keeping the same open/close feedback. Sized by `size` (footprint).
const PINK = '#FF4FA3';
const MAGENTA = C.ACCENT_HOT;   // #e056fd
const GEAR_IDLE = '#CBB8D8';    // soft metallic lilac — reads on dark + light surfaces

export default function SlimeGearhead({
  size = 30, active = false, style,
}: { size?: number; active?: boolean; style?: StyleProp<ViewStyle> }) {
  const spin = useSharedValue(0);
  const bob = useSharedValue(0);

  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [bob]);
  // Restart the spin at the active/idle speed whenever `active` flips (fast + reverse-friendly).
  useEffect(() => {
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: active ? 900 : 5200, easing: Easing.linear }), -1, false);
  }, [active, spin]);

  const gearSpin = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const bodyBob = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bob.value, [0, 1], [0.8, -1.4]) },
      { scaleY: interpolate(bob.value, [0, 1], [1, 1.05]) },
    ],
  }));

  const gearSize = Math.round(size * 0.64);
  const bodyW = Math.round(size * 0.72);
  const bodyH = Math.round(size * 0.58);
  const eye = Math.max(2, Math.round(size * 0.09));

  return (
    <View style={[{ width: size, height: size }, styles.wrap, style]}>
      {/* slime body — a brand-gradient droplet with two eyes */}
      <Animated.View style={bodyBob}>
        <LinearGradient
          colors={[PINK, MAGENTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{
            width: bodyW,
            height: bodyH,
            borderTopLeftRadius: bodyW * 0.5,
            borderTopRightRadius: bodyW * 0.5,
            borderBottomLeftRadius: bodyW * 0.3,
            borderBottomRightRadius: bodyW * 0.42,
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: bodyH * 0.18,
          }}>
          <View style={[styles.eyes, { gap: eye }]}>
            <View style={{ width: eye, height: eye, borderRadius: eye / 2, backgroundColor: '#1a0a1f' }} />
            <View style={{ width: eye, height: eye, borderRadius: eye / 2, backgroundColor: '#1a0a1f' }} />
          </View>
        </LinearGradient>
      </Animated.View>

      {/* gear "head" — sits on top of the dome and turns */}
      <Animated.View style={[styles.gear, gearSpin]} pointerEvents="none">
        <Ionicons name="cog" size={gearSize} color={active ? MAGENTA : GEAR_IDLE} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'flex-end' },
  eyes: { flexDirection: 'row' },
  gear: { position: 'absolute', top: 0, alignSelf: 'center' },
});
