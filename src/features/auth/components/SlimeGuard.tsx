import React, { useEffect } from 'react';
import { View, Image, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing, interpolate,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C } from '../../../theme';

// The security cousin of <SlimeWelcome>: a "guard slime" shown on the two-factor screen. Same animated
// language (twinkles, drifting shapes, a glowing backdrop, a bobbing logo character) but nuanced for
// security — a VAULT DOOR backdrop with a slowly-turning dial, a sweeping scan line, floating
// locks/keys/shields, and the slime wearing shades while hugging a pulsing shield.

const logo = require('../../../assets/driplogo.png');

const PINK = '#FF4FA3';
const MAGENTA = C.ACCENT_HOT; // #e056fd
const TEAL = C.TEAL;          // #2DD4BF

const SCENE_H = 212;
const SLIME_W = 118;
const SLIME_H = Math.round((SLIME_W * 321) / 194); // ~195
const VAULT = 150;

// ── twinkling icon (security glyphs) ──────────────────────────────────────────
function Twinkle({ left, right, top, size, color, delay, name }: {
  left?: number; right?: number; top: number; size: number; color: string; delay: number; name: string;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: 0.2 + t.value * 0.8,
    transform: [{ scale: 0.6 + t.value * 0.5 }, { rotate: `${interpolate(t.value, [0, 1], [-8, 12])}deg` }],
  }));
  return (
    <Animated.View style={[styles.abs, { left, right, top }, st]} pointerEvents="none">
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

// ── drifting shape (circle / ring / soft square) ──────────────────────────────
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

// ── vault door backdrop (turning dial + glow) ─────────────────────────────────
const BOLTS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  const r = VAULT / 2 - 11;
  return { left: VAULT / 2 + Math.cos(a) * r - 4, top: VAULT / 2 + Math.sin(a) * r - 4 };
});

function Vault() {
  const spin = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 16000, easing: Easing.linear }), -1, false);
    glow.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [spin, glow]);
  const dialStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.4 + glow.value * 0.45 }));
  return (
    <View style={styles.vaultWrap} pointerEvents="none">
      <Animated.View style={[styles.vaultGlow, glowStyle]} />
      <LinearGradient colors={['#241433', '#150a22', '#0c0614']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.vault}>
        <View style={styles.vaultRing} />
        {BOLTS.map((b, i) => <View key={i} style={[styles.bolt, { left: b.left, top: b.top }]} />)}
        {/* turning dial / handle */}
        <Animated.View style={[styles.dial, dialStyle]}>
          <View style={styles.spokeH} />
          <View style={styles.spokeV} />
          <View style={styles.dialHub} />
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

// ── sweeping security scan line ───────────────────────────────────────────────
function ScanLine() {
  const s = useSharedValue(0);
  useEffect(() => {
    s.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, false);
  }, [s]);
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(s.value, [0, 0.5, 1], [0, 0.45, 0]),
    transform: [{ translateY: interpolate(s.value, [0, 1], [8, SCENE_H - 24]) }],
  }));
  return (
    <Animated.View style={[styles.scan, st]} pointerEvents="none">
      <LinearGradient colors={['rgba(45,212,191,0)', TEAL, 'rgba(45,212,191,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

// ── the guard slime: logo body + shades (with glint) + a hugged, pulsing shield
function GuardSlime() {
  const bob = useSharedValue(0);
  const glint = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.quad) }), -1, true);
    glint.value = withRepeat(withDelay(1600, withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) })), -1, false);
    pulse.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [bob, glint, pulse]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bob.value, [0, 1], [0, -8]) },
      { rotate: `${interpolate(bob.value, [0, 1], [-2, 2])}deg` },
      { scaleY: interpolate(bob.value, [0, 1], [1, 1.03]) },
    ],
  }));
  const glintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glint.value, [0, 0.5, 1], [0, 0.85, 0]),
    transform: [{ translateX: interpolate(glint.value, [0, 1], [-4, 46]) }, { rotate: '22deg' }],
  }));
  const shieldStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.97 + pulse.value * 0.08 }] }));
  const shieldGlowStyle = useAnimatedStyle(() => ({ opacity: 0.3 + pulse.value * 0.5 }));

  return (
    <Animated.View style={[styles.slime, bodyStyle]}>
      <Image source={logo} style={styles.slimeImg} resizeMode="contain" />

      {/* sunglasses on the dome */}
      <View style={styles.glasses}>
        <View style={styles.lens} />
        <View style={styles.bridge} />
        <View style={styles.lens} />
        <Animated.View style={[styles.glint, glintStyle]} />
      </View>

      {/* hugged shield (held with two stubby arms), pulsing protective glow */}
      <View style={styles.shieldWrap}>
        <Animated.View style={[styles.shieldGlow, shieldGlowStyle]} />
        <LinearGradient colors={[PINK, MAGENTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.armNub, { left: -6 }]} />
        <LinearGradient colors={[PINK, MAGENTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.armNub, { right: -6 }]} />
        <Animated.View style={shieldStyle}>
          <Ionicons name="shield-checkmark" size={42} color={TEAL} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

export default function SlimeGuard() {
  const halo = useSharedValue(0);
  useEffect(() => {
    halo.value = withRepeat(withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [halo]);
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.35 + halo.value * 0.35, transform: [{ scale: 0.9 + halo.value * 0.12 }] }));

  return (
    <View style={styles.scene}>
      <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />
      <Vault />
      <ScanLine />

      <Twinkle left={26} top={16} size={18} color={TEAL} delay={0} name="lock-closed" />
      <Twinkle right={30} top={30} size={16} color={MAGENTA} delay={500} name="key" />
      <Twinkle left={44} top={120} size={14} color={C.MUTED} delay={900} name="finger-print" />
      <Twinkle right={38} top={120} size={18} color={PINK} delay={300} name="shield-checkmark" />
      <Twinkle left={12} top={78} size={13} color={MAGENTA} delay={1200} name="sparkles" />
      <Twinkle right={18} top={84} size={12} color={TEAL} delay={700} name="star" />

      <Floaty left={64} top={54} size={9} color={TEAL} shape="circle" delay={200} />
      <Floaty right={60} top={60} size={13} color={MAGENTA} shape="ring" delay={1100} />
      <Floaty left={22} top={150} size={8} color={PINK} shape="square" delay={600} />
      <Floaty right={52} top={166} size={8} color={C.MUTED} shape="circle" delay={1500} />

      <GuardSlime />
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { width: '100%', height: SCENE_H, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 },
  abs: { position: 'absolute' },

  halo: { position: 'absolute', width: 210, height: 210, borderRadius: 105, bottom: 4, backgroundColor: 'rgba(45,212,191,0.16)' },

  // vault
  vaultWrap: { position: 'absolute', top: 14, alignItems: 'center', justifyContent: 'center' },
  vaultGlow: { position: 'absolute', width: VAULT + 26, height: VAULT + 26, borderRadius: (VAULT + 26) / 2, backgroundColor: 'rgba(45,212,191,0.16)' },
  vault: {
    width: VAULT, height: VAULT, borderRadius: VAULT / 2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(45,212,191,0.4)',
  },
  vaultRing: { position: 'absolute', width: VAULT - 22, height: VAULT - 22, borderRadius: (VAULT - 22) / 2, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)' },
  bolt: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(234,201,238,0.55)' },
  dial: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  spokeH: { position: 'absolute', width: 54, height: 7, borderRadius: 4, backgroundColor: 'rgba(234,201,238,0.7)' },
  spokeV: { position: 'absolute', width: 7, height: 54, borderRadius: 4, backgroundColor: 'rgba(234,201,238,0.7)' },
  dialHub: { width: 20, height: 20, borderRadius: 10, backgroundColor: TEAL, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },

  // scan line
  scan: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },

  // slime
  slime: { width: SLIME_W, height: SLIME_H },
  slimeImg: { width: SLIME_W, height: SLIME_H },

  glasses: { position: 'absolute', top: SLIME_H * 0.13, left: SLIME_W * 0.27, width: SLIME_W * 0.46, height: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  lens: { width: 18, height: 14, borderRadius: 7, backgroundColor: '#0b0712', borderWidth: 1, borderColor: 'rgba(45,212,191,0.6)' },
  bridge: { width: 6, height: 3, backgroundColor: '#0b0712' },
  glint: { position: 'absolute', left: 0, top: -2, width: 5, height: 18, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)' },

  shieldWrap: { position: 'absolute', bottom: SLIME_H * 0.12, alignSelf: 'center', width: 56, height: 50, alignItems: 'center', justifyContent: 'center' },
  shieldGlow: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(45,212,191,0.3)' },
  armNub: { position: 'absolute', bottom: 6, width: 14, height: 10, borderRadius: 5 },
});
