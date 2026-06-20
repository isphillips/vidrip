import React, { useEffect } from 'react';
import { View, Image, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withDelay, Easing, interpolate,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C } from '../../../theme';

// Detective cousin of the auth slimes (<SlimeWelcome> etc.), for the "paste a link" screen — the slime
// is on the case, hunting down a clip to share. Same animated language (twinkles, drifting shapes,
// glowing backdrop, bobbing logo character) nuanced for sleuthing: a deerstalker hat, a magnifying
// glass examining a fingerprint, a rotating "search" ring, and floating clue glyphs.

const logo = require('../../../assets/driplogo.png');

const MAGENTA = C.ACCENT_HOT; // #e056fd
const PURPLE = C.ACCENT;      // #8b22a5
const TEAL = C.TEAL;          // #2DD4BF
const GOLD = '#FFD86B';
const TWEED = '#B79B77';
const BRASS = '#C9A24A';

const SCENE_H = 196;
const SLIME_W = 104;
const SLIME_H = Math.round((SLIME_W * 321) / 194); // ~172

function Twinkle({ left, right, top, size, color, delay, name }: {
  left?: number; right?: number; top: number; size: number; color: string; delay: number; name: string;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: 0.2 + t.value * 0.8,
    transform: [{ scale: 0.55 + t.value * 0.5 }, { rotate: `${interpolate(t.value, [0, 1], [-8, 12])}deg` }],
  }));
  return (
    <Animated.View style={[styles.abs, { left, right, top }, st]} pointerEvents="none">
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

function Floaty({ left, right, top, size, color, shape, delay }: {
  left?: number; right?: number; top: number; size: number; color: string; shape: 'circle' | 'ring'; delay: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: 0.35 + t.value * 0.5,
    transform: [{ translateY: interpolate(t.value, [0, 1], [6, -8]) }],
  }));
  const shapeStyle: ViewStyle = shape === 'circle'
    ? { borderRadius: size / 2, backgroundColor: color }
    : { borderRadius: size / 2, borderWidth: Math.max(2, size * 0.2), borderColor: color };
  return (
    <Animated.View style={[styles.abs, { left, right, top }, st]} pointerEvents="none">
      <View style={[{ width: size, height: size }, shapeStyle]} />
    </Animated.View>
  );
}

// Rotating dashed "search" ring behind the slime — like a radar sweeping for clues.
function SearchRing() {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1, false);
  }, [spin]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  return <Animated.View style={[styles.searchRing, st]} pointerEvents="none" />;
}

// The detective slime: logo body + deerstalker hat + eyes, holding a magnifier that examines a clue.
function DetectiveSlime() {
  const bob = useSharedValue(0);
  const blink = useSharedValue(1);
  const scan = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.quad) }), -1, true);
    scan.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true);
    blink.value = withRepeat(withSequence(
      withDelay(2600, withTiming(1, { duration: 30 })),
      withTiming(0.1, { duration: 70 }),
      withTiming(1, { duration: 90 }),
    ), -1, false);
  }, [bob, scan, blink]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bob.value, [0, 1], [0, -8]) },
      { rotate: `${interpolate(bob.value, [0, 1], [-2, 2])}deg` },
      { scaleY: interpolate(bob.value, [0, 1], [1, 1.03]) },
    ],
  }));
  const lidStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  // Magnifier sweeps side-to-side over the clue, scanning.
  const glassStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(scan.value, [0, 1], [-5, 5]) },
      { translateY: interpolate(scan.value, [0, 1], [2, -2]) },
      { rotate: `${interpolate(scan.value, [0, 1], [-6, 6])}deg` },
    ],
  }));
  const cluePulse = useAnimatedStyle(() => ({ opacity: 0.55 + scan.value * 0.45 }));

  return (
    <Animated.View style={[styles.slime, bodyStyle]}>
      <Image source={logo} style={styles.slimeImg} resizeMode="contain" />

      {/* deerstalker hat */}
      <View style={styles.hat}>
        <View style={styles.hatBrim} />
        <View style={styles.hatCap} />
        <View style={styles.hatBand} />
      </View>

      {/* eyes (the right one slightly narrowed — inspecting) */}
      <View style={[styles.eye, { left: SLIME_W * 0.3, top: SLIME_H * 0.13 }]}>
        <Animated.View style={[styles.eyeWhite, lidStyle]}><View style={styles.pupil} /><View style={styles.glint} /></Animated.View>
      </View>
      <View style={[styles.eye, { left: SLIME_W * 0.52, top: SLIME_H * 0.13 }]}>
        <Animated.View style={[styles.eyeWhite, styles.eyeSquint, lidStyle]}><View style={styles.pupil} /></Animated.View>
      </View>

      {/* magnifier: arm + handle + lens examining a fingerprint clue */}
      <Animated.View style={[styles.magWrap, glassStyle]}>
        <LinearGradient colors={[MAGENTA, PURPLE]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.magArm} />
        <View style={styles.magHandle} />
        <View style={styles.magLens}>
          <View style={styles.magGlass} />
          <Animated.View style={cluePulse}><Ionicons name="finger-print" size={20} color={TEAL} /></Animated.View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

export default function SlimeDetective() {
  const halo = useSharedValue(0);
  useEffect(() => {
    halo.value = withRepeat(withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [halo]);
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.32 + halo.value * 0.32, transform: [{ scale: 0.9 + halo.value * 0.12 }] }));

  return (
    <View style={styles.scene}>
      <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />
      <SearchRing />

      <Twinkle left={24} top={14} size={20} color={GOLD} delay={0} name="help" />
      <Twinkle right={26} top={28} size={16} color={TEAL} delay={500} name="finger-print" />
      <Twinkle left={40} top={108} size={15} color={MAGENTA} delay={900} name="footsteps" />
      <Twinkle right={34} top={112} size={16} color={GOLD} delay={300} name="search" />
      <Twinkle left={12} top={72} size={13} color={TEAL} delay={1200} name="help" />
      <Twinkle right={16} top={78} size={12} color={MAGENTA} delay={700} name="sparkles" />

      <Floaty left={64} top={52} size={9} color={GOLD} shape="circle" delay={200} />
      <Floaty right={58} top={58} size={13} color={MAGENTA} shape="ring" delay={1100} />
      <Floaty left={22} top={138} size={8} color={TEAL} shape="circle" delay={600} />

      <DetectiveSlime />
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { width: '100%', height: SCENE_H, alignItems: 'center', justifyContent: 'flex-end' },
  abs: { position: 'absolute' },
  halo: { position: 'absolute', width: 200, height: 200, borderRadius: 100, bottom: 2, backgroundColor: 'rgba(224,86,253,0.16)' },
  searchRing: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75, top: 18,
    borderWidth: 2, borderColor: 'rgba(45,212,191,0.4)', borderStyle: 'dashed',
  },

  slime: { width: SLIME_W, height: SLIME_H },
  slimeImg: { width: SLIME_W, height: SLIME_H },

  // deerstalker hat
  // left:0/right:0 + alignItems center → reliably centred over the face; top seats it on the dome.
  hat: { position: 'absolute', top: 0, left: -50, right: 0, alignItems: 'center', transform: [{ rotate: '-19deg' }] },
  hatBrim: { width: 64, height: 11, borderRadius: 6, backgroundColor: '#977f60' },
  hatCap: { width: 46, height: 26, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: TWEED, marginTop: -20 },
  hatBand: { position: 'absolute', bottom: 9, width: 46, height: 6, backgroundColor: '#5a4a36' },

  eye: { position: 'absolute', width: 18, height: 18 },
  eyeWhite: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  eyeSquint: { height: 12, borderRadius: 9 },
  pupil: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1a0b22' },
  glint: { position: 'absolute', top: 3, right: 3, width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },

  // magnifier (held to the lower-right, examining a clue)
  magWrap: { position: 'absolute', right: -6, top: SLIME_H * 0.42, width: 56, height: 64, alignItems: 'center' },
  magArm: { position: 'absolute', left: -10, top: 26, width: 26, height: 9, borderRadius: 5, transform: [{ rotate: '28deg' }] },
  magHandle: { position: 'absolute', bottom: 0, right: 16, width: 7, height: 26, borderRadius: 4, backgroundColor: BRASS, transform: [{ rotate: '-32deg' }] },
  magLens: { width: 44, height: 44, borderRadius: 22, borderWidth: 5, borderColor: BRASS, backgroundColor: '#0c1418', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  magGlass: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(45,212,191,0.22)' },
});
