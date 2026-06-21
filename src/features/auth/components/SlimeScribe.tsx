import React, { useEffect } from 'react';
import { View, Image, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing, interpolate,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C } from '../../../theme';

// The profile-creation cousin of <SlimeWizard> / <SlimeWelcome> — same animated language (twinkles,
// drifting shapes, glowing backdrop, bobbing logo character) tuned for *minting your identity*: Drippy
// proudly holds up a freshly-made ID badge (gradient header, avatar dot, name lines, a green ✓ that
// keeps stamping) while floating @-handles, person glyphs and envelopes drift past a soft brand halo.

const logo = require('../../../assets/driplogo.png');

const PINK = '#FF4FA3';
const PURPLE = '#A05CFF';
const BLUE = '#3B82F6';
const MAGENTA = C.ACCENT_HOT; // #e056fd
const TEAL = C.TEAL;          // #2DD4BF
const GOLD = '#FFD86B';

const SCENE_H = 176;
const SLIME_W = 87; // 25% smaller than 116 — Drippy reads as a smaller character here
const SLIME_H = Math.round((SLIME_W * 321) / 194); // ~144

// ── twinkling icon (identity glyphs) ──────────────────────────────────────────
function Twinkle({ left, right, top, size, color, delay, name }: {
  left?: number; right?: number; top: number; size: number; color: string; delay: number; name: string;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: 0.2 + t.value * 0.8,
    transform: [{ scale: 0.55 + t.value * 0.55 }, { rotate: `${interpolate(t.value, [0, 1], [-10, 14])}deg` }],
  }));
  return (
    <Animated.View style={[styles.abs, { left, right, top }, st]} pointerEvents="none">
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

// ── drifting shape (orb / ring / soft square) ─────────────────────────────────
function Floaty({ left, right, top, size, color, shape, delay }: {
  left?: number; right?: number; top: number; size: number; color: string; shape: 'circle' | 'ring' | 'square'; delay: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 3100, easing: Easing.inOut(Easing.sin) }), -1, true));
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

// ── the freshly-minted ID badge Drippy holds up (avatar + name lines + ✓ stamp) ─
function Badge() {
  const float = useSharedValue(0);
  const stamp = useSharedValue(0);
  useEffect(() => {
    float.value = withDelay(300, withRepeat(withTiming(1, { duration: 2100, easing: Easing.inOut(Easing.quad) }), -1, true));
    stamp.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [float, stamp]);
  // Bob slightly out of phase with the slime + a gentle tilt, like it's being shown off.
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(float.value, [0, 1], [3, -7]) },
      { rotate: `${interpolate(float.value, [0, 1], [-7, -2])}deg` },
    ],
  }));
  // ✓ keeps "stamping" in: a quick overshoot pop then hold.
  const checkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(stamp.value, [0, 0.12, 1], [0, 1, 1]),
    transform: [{ scale: interpolate(stamp.value, [0, 0.12, 0.24, 1], [1.8, 0.85, 1.08, 1]) }],
  }));
  return (
    <Animated.View style={[styles.badgeWrap, cardStyle]} pointerEvents="none">
      <View style={styles.badge}>
        <LinearGradient colors={[PINK, PURPLE, BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badgeHeader}>
          <View style={styles.badgeAvatar} />
        </LinearGradient>
        <View style={styles.badgeLineLg} />
        <View style={styles.badgeLineSm} />
        <View style={[styles.badgeLineSm, { width: 22 }]} />
      </View>
      <Animated.View style={[styles.badgeCheck, checkStyle]}>
        <Ionicons name="checkmark" size={13} color="#06210f" />
      </Animated.View>
    </Animated.View>
  );
}

// ── the scribe slime: logo body + eyes + a marker, bobbing while it shows the badge ──
function ScribeSlime() {
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 1850, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [bob]);
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bob.value, [0, 1], [0, -9]) },
      { rotate: `${interpolate(bob.value, [0, 1], [-2.5, 2.5])}deg` },
      { scaleY: interpolate(bob.value, [0, 1], [1, 1.035]) },
    ],
  }));

  return (
    <Animated.View style={[styles.slime, bodyStyle]}>
      <Image source={logo} style={styles.slimeImg} resizeMode="contain" />

      {/* eyes */}
      <View style={[styles.eye, { left: SLIME_W * 0.31, top: SLIME_H * 0.17 }]}>
        <View style={styles.pupil} /><View style={styles.glint} />
      </View>
      <View style={[styles.eye, { left: SLIME_W * 0.53, top: SLIME_H * 0.17 }]}>
        <View style={styles.pupil} /><View style={styles.glint} />
      </View>

      {/* little marker tucked on the other side, like it just signed the badge */}
      <View style={styles.markerWrap}>
        <LinearGradient colors={[GOLD, '#caa24a']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.markerBody} />
        <View style={styles.markerTip} />
      </View>

      {/* the badge held up to the side */}
      <Badge />
    </Animated.View>
  );
}

export default function SlimeScribe() {
  const halo = useSharedValue(0);
  useEffect(() => {
    halo.value = withRepeat(withTiming(1, { duration: 3500, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [halo]);
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.35 + halo.value * 0.35, transform: [{ scale: 0.9 + halo.value * 0.12 }] }));

  return (
    <View style={styles.scene}>
      <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />

      <Twinkle left={26} top={16} size={18} color={GOLD} delay={0} name="sparkles" />
      <Twinkle right={30} top={26} size={16} color={TEAL} delay={500} name="at" />
      <Twinkle left={40} top={120} size={15} color={MAGENTA} delay={900} name="person" />
      <Twinkle right={34} top={118} size={16} color={GOLD} delay={300} name="mail" />
      <Twinkle left={14} top={78} size={14} color={TEAL} delay={1200} name="happy" />
      <Twinkle right={18} top={84} size={13} color={MAGENTA} delay={700} name="sparkles" />

      <Floaty left={62} top={54} size={9} color={GOLD} shape="circle" delay={200} />
      <Floaty right={58} top={60} size={13} color={MAGENTA} shape="ring" delay={1100} />
      <Floaty left={22} top={150} size={8} color={TEAL} shape="square" delay={600} />
      <Floaty right={50} top={164} size={8} color={C.MUTED} shape="circle" delay={1500} />

      <ScribeSlime />
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { width: '100%', height: SCENE_H, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 },
  abs: { position: 'absolute' },

  halo: { position: 'absolute', width: 210, height: 210, borderRadius: 105, bottom: 4, backgroundColor: 'rgba(160,92,255,0.16)' },

  // slime
  slime: { width: SLIME_W, height: SLIME_H },
  slimeImg: { width: SLIME_W, height: SLIME_H },

  eye: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pupil: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#1a0b22' },
  glint: { position: 'absolute', top: 4, right: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },

  // marker
  markerWrap: { position: 'absolute', left: -10, top: SLIME_H * 0.4, width: 14, height: 40, transform: [{ rotate: '-24deg' }] },
  markerBody: { position: 'absolute', top: 0, left: 2, width: 9, height: 30, borderRadius: 3 },
  markerTip: { position: 'absolute', top: 28, left: 3, width: 0, height: 0, borderLeftWidth: 3.5, borderRightWidth: 3.5, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#1a0b22' },

  // badge held up to the side (right of the slime)
  badgeWrap: { position: 'absolute', left: SLIME_W * 0.72, top: SLIME_H * 0.08, width: 76, height: 96 },
  badge: {
    width: 70, height: 90, borderRadius: 10, backgroundColor: '#150a26',
    borderWidth: 1.5, borderColor: 'rgba(160,92,255,0.5)', padding: 7, alignItems: 'center',
    shadowColor: PURPLE, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  badgeHeader: { width: '100%', height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  badgeAvatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.92)' },
  badgeLineLg: { width: '86%', height: 6, borderRadius: 3, backgroundColor: 'rgba(234,201,238,0.85)', marginTop: 9 },
  badgeLineSm: { width: '64%', height: 4, borderRadius: 2, backgroundColor: 'rgba(234,201,238,0.45)', marginTop: 6 },
  badgeCheck: {
    position: 'absolute', right: -2, bottom: 4, width: 22, height: 22, borderRadius: 11,
    backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#150a26',
  },
});
