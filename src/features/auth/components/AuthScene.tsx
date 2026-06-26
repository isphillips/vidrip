import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, interpolate, type SharedValue,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  W, H, SceneBackdrop, HeroDrippy, Star, TEAL, GOLD, MAGENTA,
} from '../../../components/scene/sceneKit';

// ════════════════════════════════════════════════════════════════════════════════════════════
//  Auth scene — the shared Dripville world (sceneKit's <SceneBackdrop>) behind the whole sign-in
//  flow, with Drippy front and centre. On the gated screens (invite code / log in) a whimsical
//  walled archway + locked door rises behind Drippy, so he reads as the gatekeeper of Dripville.
//  Same Views + LinearGradient + Ionicons + Reanimated language as the rest of the slime-land.
// ════════════════════════════════════════════════════════════════════════════════════════════

const HERO_W = Math.min(132, W * 0.32);
const DOOR_W = Math.min(196, W * 0.5);
const DOOR_H = DOOR_W * 1.7;
const DOOR_TOP = H * 0.18;

// ── The floating, magically-glowing locked door behind Drippy (gated screens) ─────────────────
function GateWall({ enter }: { enter: SharedValue<number> }) {
  const glow = useSharedValue(0);
  const key = useSharedValue(0);
  const float = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }), -1, true);
    key.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    float.value = withRepeat(withTiming(1, { duration: 3800, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [glow, key, float]);

  const wrap = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: interpolate(enter.value, [0, 1], [28, 0]) }],
  }));
  // The door drifts up and down so it reads as floating; the glow halos drift with it.
  const doorFloat = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(float.value, [0, 1], [-6, 6]) }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.3 + glow.value * 0.4, transform: [{ scale: 0.9 + glow.value * 0.18 }, { translateY: interpolate(float.value, [0, 1], [-6, 6]) }] }));
  const halo2 = useAnimatedStyle(() => ({ opacity: 0.2 + glow.value * 0.28, transform: [{ scale: 1.05 + glow.value * 0.12 }, { translateY: interpolate(float.value, [0, 1], [-6, 6]) }] }));
  const windowGlow = useAnimatedStyle(() => ({ opacity: 0.55 + glow.value * 0.45, transform: [{ scaleY: 0.9 + glow.value * 0.14 }] }));
  const lockGlow = useAnimatedStyle(() => ({ opacity: 0.4 + glow.value * 0.6, transform: [{ scale: 0.85 + glow.value * 0.3 }] }));
  const keyFloat = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: interpolate(key.value, [0, 1], [3, -9]) }, { rotate: `${interpolate(key.value, [0, 1], [-10, 10])}deg` }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, wrap]} pointerEvents="none">
      {/* magical aura blooming from behind the floating door (two layered, pulsing, multi-hue halos) */}
      <Animated.View style={[styles.halo2, halo2]} />
      <Animated.View style={[styles.halo, halo]} />

      {/* the floating, glowing door */}
      <Animated.View style={[styles.door, doorFloat]}>
        <LinearGradient colors={['#2c1633', '#190b22']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.doorFrame} pointerEvents="none" />
        {/* arched window glowing with the magic inside */}
        <Animated.View style={[styles.window, windowGlow]}>
          <LinearGradient colors={[TEAL, '#bff7ef']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        {/* glowing seams — light leaking through the planks */}
        <View style={[styles.plank, { left: DOOR_W * 0.34 }]} />
        <View style={[styles.plank, { left: DOOR_W * 0.66 }]} />
        {/* keyhole / lock */}
        <View style={styles.lock}>
          <Animated.View style={[styles.lockGlow, lockGlow]} />
          <Ionicons name="lock-closed" size={DOOR_W * 0.18} color={GOLD} />
        </View>
        {/* twinkles of locking magic */}
        <Star left={DOOR_W * 0.2} top={DOOR_H * 0.36} size={14} color={GOLD} delay={0} name="sparkles" />
        <Star left={DOOR_W * 0.72} top={DOOR_H * 0.5} size={12} color={MAGENTA} delay={600} name="sparkles" />
        <Star left={DOOR_W * 0.5} top={DOOR_H * 0.7} size={11} color={TEAL} delay={1100} name="star" />
      </Animated.View>

      {/* a floating key, just out of reach */}
      <Animated.View style={[styles.key, keyFloat]}>
        <Ionicons name="key" size={26} color={GOLD} />
      </Animated.View>
    </Animated.View>
  );
}

// The full auth backdrop: slime-land + (optional gate) + Drippy in front, all driven by `enter`.
export function AuthScene({ gated = false, enter }: { gated?: boolean; enter: SharedValue<number> }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Gated screens (invite/login) keep it calm behind the form — no loafing crew, no balloons. */}
      <SceneBackdrop enter={enter} showCrew={!gated} showBalloons={!gated} />
      {gated && <GateWall enter={enter} />}
      <View style={styles.heroWrap}>
        <HeroDrippy enter={enter} width={HERO_W} />
      </View>
    </View>
  );
}

export { HERO_W as AUTH_HERO_W };

const styles = StyleSheet.create({
  heroWrap: { position: 'absolute', left: 0, right: 0, top: H * 0.27, alignItems: 'center' },

  // Magical aura halos centred on the door (door centre = W/2, DOOR_TOP + DOOR_H/2).
  halo: {
    position: 'absolute', width: DOOR_W * 1.7, height: DOOR_W * 1.7, borderRadius: DOOR_W * 0.85,
    left: W / 2 - DOOR_W * 0.85, top: DOOR_TOP + DOOR_H / 2 - DOOR_W * 0.85,
    backgroundColor: 'rgba(224,86,253,0.28)',
  },
  halo2: {
    position: 'absolute', width: DOOR_W * 2.2, height: DOOR_W * 2.2, borderRadius: DOOR_W * 1.1,
    left: W / 2 - DOOR_W * 1.1, top: DOOR_TOP + DOOR_H / 2 - DOOR_W * 1.1,
    backgroundColor: 'rgba(45,212,191,0.16)',
  },

  door: {
    position: 'absolute', left: (W - DOOR_W) / 2, top: DOOR_TOP, width: DOOR_W, height: DOOR_H,
    borderTopLeftRadius: DOOR_W / 2, borderTopRightRadius: DOOR_W / 2,
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8, overflow: 'hidden',
  },
  doorFrame: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3, borderColor: '#4a2473',
    borderTopLeftRadius: DOOR_W / 2, borderTopRightRadius: DOOR_W / 2,
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
  },
  window: {
    position: 'absolute', alignSelf: 'center', top: DOOR_H * 0.08, width: DOOR_W * 0.46, height: DOOR_H * 0.24,
    left: DOOR_W * 0.27, borderTopLeftRadius: DOOR_W * 0.23, borderTopRightRadius: DOOR_W * 0.23,
    borderRadius: 6, overflow: 'hidden', opacity: 0.9,
  },
  plank: { position: 'absolute', top: DOOR_H * 0.4, bottom: 6, width: 1.5, backgroundColor: 'rgba(191,247,239,0.4)' },
  lock: { position: 'absolute', alignSelf: 'center', left: DOOR_W / 2 - DOOR_W * 0.13, top: DOOR_H * 0.52, width: DOOR_W * 0.26, height: DOOR_W * 0.26, alignItems: 'center', justifyContent: 'center' },
  lockGlow: { position: 'absolute', width: DOOR_W * 0.4, height: DOOR_W * 0.4, borderRadius: DOOR_W * 0.2, backgroundColor: 'rgba(255,210,74,0.25)' },
  key: { position: 'absolute', left: W / 2 + DOOR_W * 0.34, top: DOOR_TOP + DOOR_H * 0.5 },
});
