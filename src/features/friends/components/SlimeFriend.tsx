import React, { useEffect } from 'react';
import { View, Image, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withDelay,
  Easing, interpolate,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, SPACE } from '../../../theme';

// Drippy (the Vidrip slime mascot) making a new friend: Drippy reaches out to a little
// buddy slime who pops in to say hi, with hearts rising between them and friend-themed
// twinkles drifting around. Pure Views + the logo image, animated with Reanimated
// (UI-thread loops) — no Skia, so it's cheap on this small form screen.

const logo = require('../../../assets/driplogo.png');

const PINK = '#FF4FA3';
const MAGENTA = C.ACCENT_HOT; // #e056fd
const TEAL = C.TEAL;          // #2DD4BF

const SCENE_H = 210;
const SLIME_W = 112;
const SLIME_H = Math.round((SLIME_W * 321) / 194); // preserve logo aspect → ~185
const BUDDY = 62;

// ── twinkling friend glyph ─────────────────────────────────────────────────────
function Twinkle({ left, right, top, size, color, delay, name }: {
  left?: number; right?: number; top: number; size: number; color: string; delay: number; name: string;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: 0.2 + t.value * 0.8,
    transform: [{ scale: 0.6 + t.value * 0.5 }, { rotate: `${interpolate(t.value, [0, 1], [-10, 12])}deg` }],
  }));
  return (
    <Animated.View style={[styles.abs, { left, right, top }, st]} pointerEvents="none">
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

// ── drifting shape ──────────────────────────────────────────────────────────────
function Floaty({ left, right, top, size, color, shape, delay }: {
  left?: number; right?: number; top: number; size: number; color: string; shape: 'circle' | 'ring' | 'square'; delay: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: 0.35 + t.value * 0.5,
    transform: [{ translateY: interpolate(t.value, [0, 1], [7, -9]) }, { rotate: `${interpolate(t.value, [0, 1], [0, 45])}deg` }],
  }));
  const shapeStyle: ViewStyle =
    shape === 'circle' ? { borderRadius: size / 2, backgroundColor: color }
      : shape === 'ring' ? { borderRadius: size / 2, borderWidth: Math.max(2, size * 0.2), borderColor: color }
        : { borderRadius: size * 0.28, backgroundColor: color };
  return (
    <Animated.View style={[styles.abs, { left, right, top }, st]} pointerEvents="none">
      <View style={[{ width: size, height: size }, shapeStyle]} />
    </Animated.View>
  );
}

// ── a heart rising + fading between the two friends ────────────────────────────
function RisingHeart({ left, size, delay, color }: { left: number; size: number; delay: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), -1, false));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 0.8, 1], [0, 0.9, 0.7, 0]),
    transform: [{ translateY: interpolate(t.value, [0, 1], [0, -54]) }, { scale: 0.5 + t.value * 0.7 }],
  }));
  return (
    <Animated.View style={[styles.abs, { left, top: 78 }, st]} pointerEvents="none">
      <Ionicons name="heart" size={size} color={color} />
    </Animated.View>
  );
}

// ── Drippy: logo body + eyes + a reaching arm, bobbing on a loop ───────────────
function Drippy() {
  const bob = useSharedValue(0);
  const reach = useSharedValue(0);
  const blink = useSharedValue(1);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.quad) }), -1, true);
    reach.value = withRepeat(withSequence(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) }),
    ), -1, false);
    blink.value = withRepeat(withSequence(
      withDelay(2400, withTiming(1, { duration: 30 })),
      withTiming(0.1, { duration: 70 }),
      withTiming(1, { duration: 90 }),
    ), -1, false);
  }, [bob, reach, blink]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bob.value, [0, 1], [0, -9]) },
      { rotate: `${interpolate(bob.value, [0, 1], [-2.5, 2.5])}deg` },
      { scaleY: interpolate(bob.value, [0, 1], [1, 1.035]) },
    ],
  }));
  const armStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(reach.value, [0, 1], [6, 40])}deg` }] }));
  const lidStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));

  return (
    <Animated.View style={[styles.drippy, bodyStyle]}>
      <Image source={logo} style={styles.drippyImg} resizeMode="contain" />
      <View style={[styles.eye, { left: SLIME_W * 0.31, top: SLIME_H * 0.12 }]}>
        <Animated.View style={[styles.eyeWhite, lidStyle]}><View style={styles.pupil} /><View style={styles.glint} /></Animated.View>
      </View>
      <View style={[styles.eye, { left: SLIME_W * 0.53, top: SLIME_H * 0.12 }]}>
        <Animated.View style={[styles.eyeWhite, lidStyle]}><View style={styles.pupil} /><View style={styles.glint} /></Animated.View>
      </View>
      {/* reaching arm toward the buddy */}
      <Animated.View style={[styles.armPivot, armStyle]}>
        <LinearGradient colors={[PINK, MAGENTA]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.arm} />
        <LinearGradient colors={[PINK, MAGENTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hand} />
      </Animated.View>
    </Animated.View>
  );
}

// ── the buddy slime being added: a teal blob who pops in + bobs ────────────────
function Buddy() {
  const pop = useSharedValue(0);
  const bob = useSharedValue(0);
  const blink = useSharedValue(1);
  useEffect(() => {
    pop.value = withDelay(450, withTiming(1, { duration: 600, easing: Easing.out(Easing.back(1.6)) }));
    bob.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, true);
    blink.value = withRepeat(withSequence(
      withDelay(3000, withTiming(1, { duration: 30 })),
      withTiming(0.1, { duration: 70 }),
      withTiming(1, { duration: 90 }),
    ), -1, false);
  }, [pop, bob, blink]);

  const style = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [
      { scale: pop.value },
      { translateY: interpolate(bob.value, [0, 1], [0, -7]) },
      { rotate: `${interpolate(bob.value, [0, 1], [3, -3])}deg` },
    ],
  }));
  const lidStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));

  return (
    <Animated.View style={[styles.buddyWrap, style]}>
      <LinearGradient colors={[TEAL, '#1AA9C9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buddyBody}>
        <View style={styles.buddyEyes}>
          <Animated.View style={[styles.buddyEye, lidStyle]}><View style={styles.buddyPupil} /></Animated.View>
          <Animated.View style={[styles.buddyEye, lidStyle]}><View style={styles.buddyPupil} /></Animated.View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function SlimeFriend() {
  const halo = useSharedValue(0);
  useEffect(() => {
    halo.value = withRepeat(withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [halo]);
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.35 + halo.value * 0.35, transform: [{ scale: 0.92 + halo.value * 0.12 }] }));

  return (
    <View style={styles.scene}>
      <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />

      <Twinkle left={26} top={14} size={20} color={TEAL} delay={0} name="person-add" />
      <Twinkle right={30} top={28} size={16} color={MAGENTA} delay={500} name="sparkles" />
      <Twinkle left={44} top={118} size={14} color={PINK} delay={900} name="heart" />
      <Twinkle right={40} top={120} size={18} color={TEAL} delay={300} name="people" />
      <Twinkle left={14} top={80} size={13} color={MAGENTA} delay={1200} name="happy" />
      <Twinkle right={18} top={86} size={12} color={PINK} delay={700} name="star" />

      <Floaty left={64} top={56} size={9} color={TEAL} shape="circle" delay={200} />
      <Floaty right={60} top={62} size={13} color={MAGENTA} shape="ring" delay={1100} />
      <Floaty left={22} top={150} size={8} color={PINK} shape="square" delay={600} />
      <Floaty right={52} top={166} size={8} color={C.MUTED} shape="circle" delay={1500} />

      {/* hearts rising in the gap between the two friends */}
      <RisingHeart left={SCENE_H * 0.86} size={14} delay={0} color={PINK} />
      <RisingHeart left={SCENE_H * 0.96} size={10} delay={1300} color={MAGENTA} />

      <View style={styles.row}>
        <Drippy />
        <Buddy />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { width: '100%', height: SCENE_H, alignItems: 'center', justifyContent: 'flex-end' },
  abs: { position: 'absolute' },
  halo: { position: 'absolute', width: 220, height: 220, borderRadius: 110, bottom: 6, backgroundColor: 'rgba(224,86,253,0.16)' },

  row: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.SM },

  // Drippy
  drippy: { width: SLIME_W, height: SLIME_H },
  drippyImg: { width: SLIME_W, height: SLIME_H },
  eye: { position: 'absolute', width: 20, height: 20 },
  eyeWhite: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pupil: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#1a0b22' },
  glint: { position: 'absolute', top: 4, right: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
  armPivot: { position: 'absolute', left: SLIME_W * 0.74, top: SLIME_H * 0.34, width: 32, height: 32 },
  arm: { position: 'absolute', left: 2, bottom: 4, width: 22, height: 9, borderRadius: 5, transform: [{ rotate: '-28deg' }] },
  hand: { position: 'absolute', right: -2, top: 0, width: 14, height: 14, borderRadius: 7 },

  // Buddy
  buddyWrap: { width: BUDDY, height: BUDDY, marginBottom: SLIME_H * 0.06 },
  buddyBody: {
    width: BUDDY, height: BUDDY * 0.92,
    borderTopLeftRadius: BUDDY * 0.5, borderTopRightRadius: BUDDY * 0.5,
    borderBottomLeftRadius: BUDDY * 0.38, borderBottomRightRadius: BUDDY * 0.38,
    alignItems: 'center', justifyContent: 'flex-start', paddingTop: BUDDY * 0.22,
  },
  buddyEyes: { flexDirection: 'row', gap: BUDDY * 0.14 },
  buddyEye: { width: BUDDY * 0.22, height: BUDDY * 0.22, borderRadius: BUDDY * 0.11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  buddyPupil: { width: BUDDY * 0.1, height: BUDDY * 0.1, borderRadius: BUDDY * 0.05, backgroundColor: '#0b2a30' },
});
