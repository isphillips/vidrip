import React, { useEffect } from 'react';
import { View, Image, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing, interpolate,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C } from '../../../theme';

// The wizard cousin of <SlimeWelcome> / <SlimeGuard>, for the invite-code screen — you whisper the
// secret incantation to get in. Same animated language (twinkles, drifting shapes, glowing backdrop,
// bobbing logo character) nuanced for magic: a glowing PORTAL with a turning rune ring, floating
// moons/stars/orbs, and the slime in a wizard hat casting sparkles from a wand.

const logo = require('../../../assets/driplogo.png');

const PINK = '#FF4FA3';
const MAGENTA = C.ACCENT_HOT; // #e056fd
const PURPLE = C.ACCENT;      // #8b22a5
const TEAL = C.TEAL;          // #2DD4BF
const GOLD = '#FFD86B';

const SCENE_H = 240;
const SLIME_W = 120;
const SLIME_H = Math.round((SLIME_W * 321) / 194); // ~199
const PORTAL = 150;

// ── twinkling icon (celestial glyphs) ─────────────────────────────────────────
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

// ── magic portal backdrop (swirling interior + turning rune ring + glow) ───────
const RUNES = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  const r = PORTAL / 2 - 14;
  return { left: PORTAL / 2 + Math.cos(a) * r - 3, top: PORTAL / 2 + Math.sin(a) * r - 3, gold: i % 2 === 0 };
});

function Portal() {
  const spin = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 18000, easing: Easing.linear }), -1, false);
    glow.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [spin, glow]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.4 + glow.value * 0.45, transform: [{ scale: 0.94 + glow.value * 0.1 }] }));
  return (
    <View style={styles.portalWrap} pointerEvents="none">
      <Animated.View style={[styles.portalGlow, glowStyle]} />
      <View style={styles.portalArch}>
        <LinearGradient colors={['#3a1167', MAGENTA, '#143b5e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.portalInner} />
      </View>
      {/* turning rune ring */}
      <Animated.View style={[styles.runeRing, ringStyle]}>
        {RUNES.map((r, i) => <View key={i} style={[styles.rune, { left: r.left, top: r.top, backgroundColor: r.gold ? GOLD : 'rgba(255,255,255,0.6)' }]} />)}
      </Animated.View>
    </View>
  );
}

// ── sparkles cast from the wand tip ───────────────────────────────────────────
function CastStar({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }), -1, false));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.35, 1], [0, 1, 0]),
    transform: [
      { translateX: x }, { translateY: y + interpolate(t.value, [0, 1], [0, -10]) },
      { scale: interpolate(t.value, [0, 0.35, 1], [0.2, 1, 0.4]) }, { rotate: `${t.value * 40}deg` },
    ],
  }));
  return <Animated.View style={[styles.abs, st]} pointerEvents="none"><Ionicons name="sparkles" size={size} color={GOLD} /></Animated.View>;
}

// ── the wizard slime: logo body + pointy hat + eyes + a casting wand, bobbing ──
function WizardSlime() {
  const bob = useSharedValue(0);
  const cast = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 1850, easing: Easing.inOut(Easing.quad) }), -1, true);
    cast.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [bob, cast]);
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bob.value, [0, 1], [0, -9]) },
      { rotate: `${interpolate(bob.value, [0, 1], [-2.5, 2.5])}deg` },
      { scaleY: interpolate(bob.value, [0, 1], [1, 1.035]) },
    ],
  }));
  const tipGlow = useAnimatedStyle(() => ({ opacity: 0.4 + cast.value * 0.6, transform: [{ scale: 0.85 + cast.value * 0.35 }] }));

  return (
    <Animated.View style={[styles.slime, bodyStyle]}>
      <Image source={logo} style={styles.slimeImg} resizeMode="contain" />

      {/* wizard hat, sat jaunty on the dome */}
      <View style={styles.hat}>
        <View style={styles.hatCone} />
        <View style={styles.hatBand} />
        <View style={styles.hatBrim} />
        <Ionicons name="star" size={13} color={GOLD} style={styles.hatStar} />
      </View>

      {/* eyes */}
      <View style={[styles.eye, { left: SLIME_W * 0.31, top: SLIME_H * 0.17 }]}>
        <View style={styles.pupil} /><View style={styles.glint} />
      </View>
      <View style={[styles.eye, { left: SLIME_W * 0.53, top: SLIME_H * 0.17 }]}>
        <View style={styles.pupil} /><View style={styles.glint} />
      </View>

      {/* wand raised to the side, star tip glowing + casting sparkles */}
      <View style={styles.wandWrap}>
        <LinearGradient colors={['#7a4a1e', '#caa24a']} start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }} style={styles.wandStick} />
        <Animated.View style={[styles.wandGlow, tipGlow]} />
        <Ionicons name="star" size={18} color={GOLD} style={styles.wandStar} />
        <View style={styles.casts}>
          <CastStar x={0} y={-2} size={9} delay={0} />
          <CastStar x={10} y={-8} size={7} delay={420} />
          <CastStar x={-6} y={2} size={6} delay={840} />
        </View>
      </View>
    </Animated.View>
  );
}

export default function SlimeWizard() {
  const halo = useSharedValue(0);
  useEffect(() => {
    halo.value = withRepeat(withTiming(1, { duration: 3500, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [halo]);
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.35 + halo.value * 0.35, transform: [{ scale: 0.9 + halo.value * 0.12 }] }));

  return (
    <View style={styles.scene}>
      <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />
      <Portal />

      <Twinkle left={26} top={14} size={20} color={GOLD} delay={0} name="moon" />
      <Twinkle right={28} top={30} size={16} color={TEAL} delay={500} name="star" />
      <Twinkle left={44} top={118} size={14} color={MAGENTA} delay={900} name="sparkles" />
      <Twinkle right={36} top={120} size={18} color={GOLD} delay={300} name="star" />
      <Twinkle left={12} top={80} size={13} color={TEAL} delay={1200} name="planet" />
      <Twinkle right={18} top={86} size={12} color={MAGENTA} delay={700} name="sparkles" />

      <Floaty left={64} top={56} size={9} color={GOLD} shape="circle" delay={200} />
      <Floaty right={60} top={62} size={13} color={MAGENTA} shape="ring" delay={1100} />
      <Floaty left={22} top={150} size={8} color={TEAL} shape="square" delay={600} />
      <Floaty right={52} top={168} size={8} color={C.MUTED} shape="circle" delay={1500} />

      <WizardSlime />
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { width: '100%', height: SCENE_H, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 },
  abs: { position: 'absolute' },

  halo: { position: 'absolute', width: 210, height: 210, borderRadius: 105, bottom: 4, backgroundColor: 'rgba(224,86,253,0.16)' },

  // portal
  portalWrap: { position: 'absolute', top: 12, alignItems: 'center', justifyContent: 'center' },
  portalGlow: { position: 'absolute', width: PORTAL + 26, height: PORTAL + 26, borderRadius: (PORTAL + 26) / 2, backgroundColor: 'rgba(224,86,253,0.2)' },
  portalArch: {
    width: PORTAL, height: PORTAL + 16, borderTopLeftRadius: PORTAL / 2, borderTopRightRadius: PORTAL / 2,
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18, padding: 6,
    backgroundColor: '#150a26', borderWidth: 2, borderColor: 'rgba(224,86,253,0.45)', overflow: 'hidden',
  },
  portalInner: {
    flex: 1, borderTopLeftRadius: PORTAL / 2 - 6, borderTopRightRadius: PORTAL / 2 - 6,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12, opacity: 0.85,
  },
  runeRing: { position: 'absolute', width: PORTAL, height: PORTAL },
  rune: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },

  // slime
  slime: { width: SLIME_W, height: SLIME_H },
  slimeImg: { width: SLIME_W, height: SLIME_H },

  // wizard hat (CSS-triangle cone + band + brim + star)
  hat: { position: 'absolute', top: -34, alignSelf: 'center', left: SLIME_W * 0.28, alignItems: 'center', transform: [{ rotate: '-8deg' }] },
  hatCone: { width: 0, height: 0, borderLeftWidth: 21, borderRightWidth: 21, borderBottomWidth: 46, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: PURPLE },
  hatBand: { width: 44, height: 7, marginTop: -2, backgroundColor: GOLD, borderRadius: 2 },
  hatBrim: { width: 60, height: 11, borderRadius: 6, backgroundColor: '#5a1a78', marginTop: 1 },
  hatStar: { position: 'absolute', top: 12 },

  eye: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pupil: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#1a0b22' },
  glint: { position: 'absolute', top: 4, right: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },

  // wand
  wandWrap: { position: 'absolute', left: SLIME_W * 0.74, top: SLIME_H * 0.16, width: 40, height: 56 },
  wandStick: { position: 'absolute', left: 6, bottom: 0, width: 6, height: 40, borderRadius: 3, transform: [{ rotate: '32deg' }] },
  wandGlow: { position: 'absolute', right: 2, top: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,216,107,0.45)' },
  wandStar: { position: 'absolute', right: 4, top: 2 },
  casts: { position: 'absolute', right: 10, top: 6 },
});
