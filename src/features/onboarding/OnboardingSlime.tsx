import React, { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withDelay, Easing, interpolate,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C } from '../../theme';

// The Vidrip slime mascot that guides the onboarding flow — same character family as the auth screens
// (<SlimeWelcome> etc.), but compact: it bobs, blinks, and holds up a step-specific badge (a sparkle to
// welcome you, a heart for your likes, a paper plane to share, a grin to react, a trophy when you're in).

const logo = require('../../assets/driplogo.png');

const PINK = '#FF4FA3';
const MAGENTA = C.ACCENT_HOT; // #e056fd
const TEAL = C.TEAL;          // #2DD4BF
const GOLD = '#FFD86B';

const SLIME_W = 72;
const SLIME_H = Math.round((SLIME_W * 321) / 194); // ~119

export type SlimeMood = 'welcome' | 'liked' | 'share' | 'react' | 'done';
const MOODS: Record<SlimeMood, { icon: string; color: string }> = {
  welcome: { icon: 'sparkles', color: GOLD },
  liked: { icon: 'heart', color: PINK },
  share: { icon: 'paper-plane', color: TEAL },
  react: { icon: 'happy', color: GOLD },
  done: { icon: 'trophy', color: GOLD },
};

function Twinkle({ left, right, top, size, color, delay, name }: {
  left?: number; right?: number; top: number; size: number; color: string; delay: number; name: string;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({ opacity: 0.2 + t.value * 0.8, transform: [{ scale: 0.55 + t.value * 0.5 }] }));
  return (
    <Animated.View style={[styles.abs, { left, right, top }, st]} pointerEvents="none">
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

export default function OnboardingSlime({ mood }: { mood: SlimeMood }) {
  const bob = useSharedValue(0);
  const blink = useSharedValue(1);
  const badge = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true);
    blink.value = withRepeat(withSequence(
      withDelay(2400, withTiming(1, { duration: 30 })),
      withTiming(0.1, { duration: 70 }),
      withTiming(1, { duration: 90 }),
    ), -1, false);
    badge.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [bob, blink, badge]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bob.value, [0, 1], [0, -7]) },
      { rotate: `${interpolate(bob.value, [0, 1], [-2.5, 2.5])}deg` },
      { scaleY: interpolate(bob.value, [0, 1], [1, 1.03]) },
    ],
  }));
  const lidStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(badge.value, [0, 1], [2, -4]) }, { scale: 0.96 + badge.value * 0.08 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.3 + badge.value * 0.5 }));

  const m = MOODS[mood];
  return (
    <View style={styles.wrap}>
      <Twinkle left={6} top={10} size={13} color={TEAL} delay={0} name="star" />
      <Twinkle right={8} top={22} size={11} color={MAGENTA} delay={500} name="sparkles" />
      <Twinkle left={18} top={90} size={10} color={GOLD} delay={1000} name="star" />

      <Animated.View style={[styles.slime, bodyStyle]}>
        <Image source={logo} style={styles.slimeImg} resizeMode="contain" />

        {/* eyes */}
        <View style={[styles.eye, { left: SLIME_W * 0.24, top: SLIME_H * 0.14 }]}>
          <Animated.View style={[styles.eyeWhite, lidStyle]}><View style={styles.pupil} /><View style={styles.glint} /></Animated.View>
        </View>
        <View style={[styles.eye, { left: SLIME_W * 0.55, top: SLIME_H * 0.14 }]}>
          <Animated.View style={[styles.eyeWhite, lidStyle]}><View style={styles.pupil} /><View style={styles.glint} /></Animated.View>
        </View>

        {/* raised arm holding the step badge */}
        <LinearGradient colors={[PINK, MAGENTA]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.arm} />
        <Animated.View style={[styles.badge, badgeStyle]}>
          <Animated.View style={[styles.badgeGlow, glowStyle]} />
          <Ionicons name={m.icon} size={18} color={m.color} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 116, height: 132, alignItems: 'center', justifyContent: 'flex-end' },
  abs: { position: 'absolute' },
  slime: { width: SLIME_W, height: SLIME_H },
  slimeImg: { width: SLIME_W, height: SLIME_H },

  eye: { position: 'absolute', width: 16, height: 16 },
  eyeWhite: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pupil: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1a0b22' },
  glint: { position: 'absolute', top: 3, right: 3, width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },

  arm: { position: 'absolute', right: -4, top: SLIME_H * 0.26, width: 20, height: 8, borderRadius: 4, transform: [{ rotate: '-38deg' }] },
  badge: { position: 'absolute', right: -18, top: -6, width: 32, height: 32, borderRadius: 16, backgroundColor: '#1c0f2e', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  badgeGlow: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,216,107,0.28)' },
});
