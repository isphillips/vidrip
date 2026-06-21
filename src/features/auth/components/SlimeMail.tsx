import React, { useEffect } from 'react';
import { View, Image, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing, interpolate,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C } from '../../../theme';

// The "magic link sent" cousin of <SlimeWizard> / <SlimeScribe> — same animated language (twinkles,
// drifting shapes, glowing backdrop, bobbing logo character) tuned for *check your email*: Drippy holds
// up a glowing sealed envelope (brand-gradient flap, a green ✓ stamp) while a little paper plane whooshes
// off on a dotted trail and mail glyphs drift past a soft brand halo.

const logo = require('../../../assets/driplogo.png');

const PINK = '#FF4FA3';
const PURPLE = '#A05CFF';
const BLUE = '#3B82F6';
const MAGENTA = C.ACCENT_HOT; // #e056fd
const TEAL = C.TEAL;          // #2DD4BF
const GOLD = '#FFD86B';

const SCENE_H = 188;
const SLIME_W = 100;
const SLIME_H = Math.round((SLIME_W * 321) / 194); // ~165

// ── twinkling icon (mail glyphs) ──────────────────────────────────────────────
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

// ── a paper plane whooshing off with a dotted trail ───────────────────────────
function PaperPlane() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [t]);
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 0.8, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: interpolate(t.value, [0, 1], [0, 40]) },
      { translateY: interpolate(t.value, [0, 1], [0, -26]) },
      { rotate: '-18deg' },
    ],
  }));
  const dot = (i: number) => useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.2 + i * 0.12, 0.6 + i * 0.12, 1], [0, 0.7, 0.7, 0]),
  }));
  return (
    <View style={styles.planeWrap} pointerEvents="none">
      <Animated.View style={[styles.trailDot, { left: 2, top: 10 }, dot(0)]} />
      <Animated.View style={[styles.trailDot, { left: 9, top: 6 }, dot(1)]} />
      <Animated.View style={[styles.trailDot, { left: 16, top: 2 }, dot(2)]} />
      <Animated.View style={st}>
        <Ionicons name="paper-plane" size={20} color={TEAL} />
      </Animated.View>
    </View>
  );
}

// ── the glowing sealed envelope Drippy holds up (brand flap + ✓ stamp) ─────────
function Envelope() {
  const float = useSharedValue(0);
  const stamp = useSharedValue(0);
  useEffect(() => {
    float.value = withDelay(300, withRepeat(withTiming(1, { duration: 2100, easing: Easing.inOut(Easing.quad) }), -1, true));
    stamp.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [float, stamp]);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(float.value, [0, 1], [3, -7]) },
      { rotate: `${interpolate(float.value, [0, 1], [-6, -1])}deg` },
    ],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(stamp.value, [0, 0.12, 1], [0, 1, 1]),
    transform: [{ scale: interpolate(stamp.value, [0, 0.12, 0.24, 1], [1.8, 0.85, 1.08, 1]) }],
  }));
  return (
    <Animated.View style={[styles.envWrap, cardStyle]} pointerEvents="none">
      <View style={styles.env}>
        {/* body */}
        <View style={styles.envBody} />
        {/* flap */}
        <LinearGradient colors={[PINK, PURPLE, BLUE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.envFlapBase} />
        <View style={styles.envFlap} />
      </View>
      <Animated.View style={[styles.envCheck, checkStyle]}>
        <Ionicons name="checkmark" size={12} color="#06210f" />
      </Animated.View>
    </Animated.View>
  );
}

// ── the mail-carrier slime: logo body + eyes, bobbing while holding the envelope ──
function MailSlime() {
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

      {/* the envelope held up to the side + a paper plane whooshing off above it */}
      <Envelope />
      <PaperPlane />
    </Animated.View>
  );
}

export default function SlimeMail() {
  const halo = useSharedValue(0);
  useEffect(() => {
    halo.value = withRepeat(withTiming(1, { duration: 3500, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [halo]);
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.35 + halo.value * 0.35, transform: [{ scale: 0.9 + halo.value * 0.12 }] }));

  return (
    <View style={styles.scene}>
      <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />

      <Twinkle left={28} top={14} size={18} color={GOLD} delay={0} name="sparkles" />
      <Twinkle right={32} top={24} size={16} color={TEAL} delay={500} name="mail" />
      <Twinkle left={42} top={112} size={15} color={MAGENTA} delay={900} name="paper-plane" />
      <Twinkle right={36} top={110} size={16} color={GOLD} delay={300} name="checkmark-circle" />
      <Twinkle left={16} top={72} size={14} color={TEAL} delay={1200} name="mail-open" />
      <Twinkle right={20} top={80} size={13} color={MAGENTA} delay={700} name="sparkles" />

      <Floaty left={64} top={50} size={9} color={GOLD} shape="circle" delay={200} />
      <Floaty right={60} top={56} size={13} color={MAGENTA} shape="ring" delay={1100} />
      <Floaty left={24} top={142} size={8} color={TEAL} shape="square" delay={600} />
      <Floaty right={52} top={156} size={8} color={C.MUTED} shape="circle" delay={1500} />

      <MailSlime />
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { width: '100%', height: SCENE_H, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 },
  abs: { position: 'absolute' },

  halo: { position: 'absolute', width: 200, height: 200, borderRadius: 100, bottom: 4, backgroundColor: 'rgba(160,92,255,0.16)' },

  // slime
  slime: { width: SLIME_W, height: SLIME_H },
  slimeImg: { width: SLIME_W, height: SLIME_H },

  eye: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pupil: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1a0b22' },
  glint: { position: 'absolute', top: 4, right: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },

  // envelope held up to the side (right of the slime)
  envWrap: { position: 'absolute', left: SLIME_W * 0.7, top: SLIME_H * 0.2, width: 64, height: 56 },
  env: {
    width: 58, height: 42, borderRadius: 7, backgroundColor: '#150a26',
    borderWidth: 1.5, borderColor: 'rgba(160,92,255,0.5)', overflow: 'hidden',
    shadowColor: PURPLE, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  envBody: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: '#1f1033' },
  // a thin gradient strip under the flap edge, then a CSS-triangle flap over the top
  envFlapBase: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  envFlap: {
    position: 'absolute', top: 0, alignSelf: 'center',
    width: 0, height: 0,
    borderLeftWidth: 29, borderRightWidth: 29, borderTopWidth: 22,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#2a163f',
  },
  envCheck: {
    position: 'absolute', right: -2, bottom: 2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#150a26',
  },

  // paper plane whooshing off, up-right of the envelope
  planeWrap: { position: 'absolute', left: SLIME_W * 0.92, top: SLIME_H * 0.06, width: 60, height: 40 },
  trailDot: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(45,212,191,0.8)' },
});
