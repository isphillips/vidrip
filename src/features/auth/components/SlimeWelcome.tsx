import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withDelay,
  Easing, interpolate,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE } from '../../../theme';

// Whimsical sign-in greeting: the Vidrip drip-logo as a little slime character waving hello in front
// of a cartoon door, surrounded by twinkling stars and drifting shapes. Pure Views + the logo image,
// animated with Reanimated (UI-thread loops) — no Skia/Canvas, so it's cheap on a gate screen.

const logo = require('../../../assets/driplogo.png');

const PINK = '#FF4FA3';
const MAGENTA = C.ACCENT_HOT; // #e056fd
const PURPLE = C.ACCENT;      // #8b22a5
const TEAL = C.TEAL;          // #2DD4BF

const SCENE_H = 244;
const SLIME_W = 124;
const SLIME_H = Math.round((SLIME_W * 321) / 194); // preserve logo aspect → ~205

// ── A twinkling icon (star / sparkle / triangle) ──────────────────────────────
function Twinkle({ left, right, top, size, color, delay, name }: {
  left?: number; right?: number; top: number; size: number; color: string; delay: number; name: string;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: 0.2 + t.value * 0.8,
    transform: [{ scale: 0.6 + t.value * 0.55 }, { rotate: `${t.value * 22}deg` }],
  }));
  return (
    <Animated.View style={[styles.abs, { left, right, top }, st]} pointerEvents="none">
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

// ── A drifting shape (circle / ring / soft square) ────────────────────────────
function Floaty({ left, right, top, size, color, shape, delay }: {
  left?: number; right?: number; top: number; size: number; color: string; shape: 'circle' | 'ring' | 'square'; delay: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: 0.35 + t.value * 0.5,
    transform: [
      { translateY: interpolate(t.value, [0, 1], [7, -9]) },
      { rotate: `${interpolate(t.value, [0, 1], [0, 45])}deg` },
    ],
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

// ── The cartoon door behind the slime (with a warm welcoming glow) ────────────
function Door() {
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.5 + glow.value * 0.5, transform: [{ scaleY: 0.9 + glow.value * 0.18 }] }));
  return (
    <View style={styles.doorWrap} pointerEvents="none">
      <View style={styles.doorFrame}>
        <LinearGradient colors={['#3a1656', PURPLE, '#2a0f3e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.doorFace}>
          {/* arched window with welcoming light */}
          <Animated.View style={[styles.doorWindow, glowStyle]}>
            <LinearGradient colors={[TEAL, '#bff7ef']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
          {/* lower panel */}
          <View style={styles.doorPanel} />
          {/* knob */}
          <View style={styles.doorKnob} />
        </LinearGradient>
      </View>
      {/* light spilling from under the door */}
      <Animated.View style={[styles.doorLight, glowStyle]} />
    </View>
  );
}

// ── The slime character: logo body + eyes + a waving arm, bobbing on a loop ────
function Slime() {
  const bob = useSharedValue(0);
  const wave = useSharedValue(0);
  const blink = useSharedValue(1);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.quad) }), -1, true);
    wave.value = withRepeat(withSequence(
      withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 300, easing: Easing.inOut(Easing.quad) }),
    ), -1, false);
    // occasional blink: hold open, snap shut, open
    blink.value = withRepeat(withSequence(
      withDelay(2400, withTiming(1, { duration: 30 })),
      withTiming(0.1, { duration: 70 }),
      withTiming(1, { duration: 90 }),
    ), -1, false);
  }, [bob, wave, blink]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(bob.value, [0, 1], [0, -9]) },
      { rotate: `${interpolate(bob.value, [0, 1], [-2.5, 2.5])}deg` },
      { scaleY: interpolate(bob.value, [0, 1], [1, 1.035]) },
    ],
  }));
  const armStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(wave.value, [0, 1], [-10, 34])}deg` }],
  }));
  const lidStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));

  return (
    <Animated.View style={[styles.slime, bodyStyle]}>
      <Image source={logo} style={styles.slimeImg} resizeMode="contain" />

      {/* eyes (sit on the pink dome above the play-button) */}
      <View style={[styles.eye, { left: SLIME_W * 0.31, top: SLIME_H * 0.12 }]}>
        <Animated.View style={[styles.eyeWhite, lidStyle]}>
          <View style={styles.pupil} />
          <View style={styles.glint} />
        </Animated.View>
      </View>
      <View style={[styles.eye, { left: SLIME_W * 0.53, top: SLIME_H * 0.12 }]}>
        <Animated.View style={[styles.eyeWhite, lidStyle]}>
          <View style={styles.pupil} />
          <View style={styles.glint} />
        </Animated.View>
      </View>

      {/* waving arm — a little gradient limb + hand, swinging from the shoulder */}
      <Animated.View style={[styles.armPivot, armStyle]}>
        <LinearGradient colors={[PINK, MAGENTA]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.arm} />
        <LinearGradient colors={[PINK, MAGENTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hand} />
      </Animated.View>
    </Animated.View>
  );
}

export default function SlimeWelcome() {
  const halo = useSharedValue(0);
  useEffect(() => {
    halo.value = withRepeat(withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [halo]);
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.4 + halo.value * 0.35, transform: [{ scale: 0.92 + halo.value * 0.12 }] }));

  return (
    <View style={styles.wrap}>
      <View style={styles.scene}>
        {/* soft radial-ish glow (layered translucent discs) */}
        <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />

        <Door />

        {/* twinkles + drifting shapes scattered around */}
        <Twinkle left={28} top={20} size={22} color={TEAL} delay={0} name="star" />
        <Twinkle right={34} top={36} size={16} color={MAGENTA} delay={500} name="sparkles" />
        <Twinkle left={48} top={120} size={14} color={C.MUTED} delay={900} name="star" />
        <Twinkle right={42} top={132} size={20} color={PINK} delay={300} name="star" />
        <Twinkle left={14} top={86} size={13} color={MAGENTA} delay={1200} name="triangle" />
        <Twinkle right={20} top={92} size={12} color={TEAL} delay={700} name="sparkles" />

        <Floaty left={66} top={60} size={10} color={TEAL} shape="circle" delay={200} />
        <Floaty right={64} top={66} size={14} color={MAGENTA} shape="ring" delay={1100} />
        <Floaty left={20} top={150} size={9} color={PINK} shape="square" delay={600} />
        <Floaty right={56} top={170} size={8} color={C.MUTED} shape="circle" delay={1500} />
        <Floaty left={86} top={196} size={11} color={MAGENTA} shape="ring" delay={400} />

        <Slime />
      </View>

      <Text style={styles.hello}>Hello</Text>
      <Text style={styles.welcome}>
        My name is Drippy. Welcome to my world, where reactions are shared with people who care.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginBottom: SPACE.LG },
  scene: { width: '100%', height: SCENE_H, alignItems: 'center', justifyContent: 'flex-end' },
  abs: { position: 'absolute' },

  halo: {
    position: 'absolute', width: 230, height: 230, borderRadius: 115, bottom: 6,
    backgroundColor: 'rgba(224,86,253,0.18)',
  },

  // door
  doorWrap: { position: 'absolute', bottom: 0, alignItems: 'center' },
  doorFrame: {
    width: 132, height: 178, borderTopLeftRadius: 66, borderTopRightRadius: 66,
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
    backgroundColor: '#170a26', padding: 7,
    borderWidth: 2, borderColor: 'rgba(224,86,253,0.35)',
  },
  doorFace: {
    flex: 1, borderTopLeftRadius: 60, borderTopRightRadius: 60, borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
    alignItems: 'center', overflow: 'hidden',
  },
  doorWindow: {
    width: 52, height: 64, marginTop: 16, borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderRadius: 8, overflow: 'hidden', opacity: 0.9,
  },
  doorPanel: {
    width: 70, height: 40, marginTop: 14, borderRadius: 8,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.14)',
  },
  doorKnob: {
    position: 'absolute', right: 14, top: 96, width: 12, height: 12, borderRadius: 6,
    backgroundColor: TEAL, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
  },
  doorLight: {
    position: 'absolute', bottom: -3, width: 150, height: 12, borderRadius: 8,
    backgroundColor: 'rgba(45,212,191,0.55)',
  },

  // slime
  slime: { width: SLIME_W, height: SLIME_H, marginBottom: 4 },
  slimeImg: { width: SLIME_W, height: SLIME_H },
  eye: { position: 'absolute', width: 20, height: 20 },
  eyeWhite: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  pupil: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#1a0b22' },
  glint: { position: 'absolute', top: 4, right: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },

  armPivot: { position: 'absolute', left: SLIME_W * 0.72, top: SLIME_H * 0.2, width: 34, height: 34 },
  arm: { position: 'absolute', left: 2, bottom: 4, width: 22, height: 9, borderRadius: 5, transform: [{ rotate: '-32deg' }] },
  hand: { position: 'absolute', right: 0, top: 0, width: 14, height: 14, borderRadius: 7 },

  // copy
  hello: {
    fontSize: 40, fontFamily: FONT.DISPLAY_BOLD, fontWeight: '700', color: C.INK,
    marginTop: SPACE.MD, letterSpacing: 0.5,
  },
  welcome: {
    fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.MUTED,
    textAlign: 'center', lineHeight: 23, maxWidth: 300, marginTop: 6,
  },
});
