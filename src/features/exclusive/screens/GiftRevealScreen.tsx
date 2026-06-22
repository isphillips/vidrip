import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSequence, withDelay, withSpring, withRepeat,
  interpolate, Extrapolation, Easing, type SharedValue,
} from 'react-native-reanimated';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import GradientIcon from '../../../components/GradientIcon';
import { fetchAward, markAwardSeen, type AwardGift } from '../../../infrastructure/exclusive/api';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

const FLOW = ['#FF4FA3', '#A05CFF', '#2DD4BF'];
const CLAMP = Extrapolation.CLAMP;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Confetti + drip particles flung out of the box on open. Trig is precomputed as plain
// numbers (no worklet math): each flies along (dx,dy), arcs down by `gravity`, and spins.
type Particle = { dx: number; dy: number; gravity: number; spin: number; color: string; w: number; h: number; r: number };
const PARTICLES: Particle[] = Array.from({ length: 24 }, (_, i) => {
  const angle = (i / 24) * Math.PI * 2 + rand(-0.25, 0.25);
  const dist = rand(110, 250);
  const drip = Math.random() < 0.42;
  const w = drip ? rand(5, 8) : rand(8, 15);
  const h = drip ? rand(16, 30) : w;
  return {
    dx: Math.cos(angle) * dist,
    dy: Math.sin(angle) * dist - rand(0, 50),  // bias upward → rise then fall
    gravity: rand(120, 340),
    spin: rand(-720, 720),
    color: pick(['#FF4FA3', '#A05CFF', '#2DD4BF', '#FFE9A8', '#FFC93C']),
    w, h, r: drip ? w / 2 : w * 0.3,
  };
});

function ConfettiPiece({ p, progress }: { p: Particle; progress: SharedValue<number> }) {
  const a = useAnimatedStyle(() => {
    const t = progress.value;
    const e = 1 - Math.pow(1 - t, 3);   // easeOutCubic fling
    return {
      opacity: interpolate(t, [0, 0.08, 0.7, 1], [0, 1, 1, 0], CLAMP),
      transform: [
        { translateX: p.dx * e },
        { translateY: p.dy * e + p.gravity * t * t },   // arc down under "gravity"
        { rotate: `${p.spin * t}deg` },
        { scale: interpolate(t, [0, 0.12], [0.2, 1], CLAMP) },
      ],
    };
  });
  return <Animated.View style={[{ position: 'absolute', width: p.w, height: p.h, borderRadius: p.r, backgroundColor: p.color }, a]} />;
}

export default function GiftRevealScreen({ route, navigation }: FeedStackScreenProps<'GiftReveal'>) {
  const { awardId } = route.params;
  const [gift, setGift] = useState<AwardGift | null>(null);
  const [opened, setOpened] = useState(false);

  // Box: springs in, wiggles, then squashes + pops as the lid sails off and everything bursts.
  const boxScale = useSharedValue(0);
  const boxRot = useSharedValue(0);
  const kick = useSharedValue(1);     // squash-and-stretch on open
  const hop = useSharedValue(0);      // little jump on open
  const lidY = useSharedValue(0);
  const lidX = useSharedValue(0);
  const lidRot = useSharedValue(0);
  const lidOpacity = useSharedValue(1);
  const burst = useSharedValue(0);    // flash
  const shock = useSharedValue(0);    // expanding ring
  const confetti = useSharedValue(0); // particle burst
  const glow = useSharedValue(0);     // idle pulse behind the box
  const reveal = useSharedValue(0);   // message + CTA
  const iconPop = useSharedValue(0);  // branded gift icon
  const iconFloat = useSharedValue(0);

  useEffect(() => {
    fetchAward(awardId).then(setGift).catch(() => {});
    markAwardSeen(awardId).catch(() => {});
  }, [awardId]);

  const pop = () => {
    if (opened) { return; }
    setOpened(true);
    // Squash down, overshoot pop, then settle (anticipation → impact).
    kick.value = withSequence(
      withTiming(0.88, { duration: 70 }),
      withTiming(1.14, { duration: 110 }),
      withSpring(1, { damping: 6, stiffness: 220 }),
    );
    hop.value = withSequence(withTiming(-24, { duration: 170, easing: Easing.out(Easing.cubic) }), withSpring(0, { damping: 8 }));
    // Lid blows off — a visible, dramatic arc up: drifting + spinning, then fades.
    lidY.value = withSequence(withTiming(-14, { duration: 120 }), withTiming(-320, { duration: 820, easing: Easing.out(Easing.cubic) }));
    lidX.value = withDelay(120, withTiming(46, { duration: 820 }));
    lidRot.value = withDelay(120, withTiming(0.7, { duration: 820 }));
    lidOpacity.value = withDelay(420, withTiming(0, { duration: 500 }));
    boxRot.value = withTiming(0, { duration: 200 });
    glow.value = withTiming(0, { duration: 250 });             // kill the idle pulse
    burst.value = withSequence(withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 520 }));
    shock.value = withTiming(1, { duration: 640, easing: Easing.out(Easing.cubic) });
    confetti.value = withTiming(1, { duration: 1150, easing: Easing.linear });
    reveal.value = withDelay(380, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    iconPop.value = withDelay(460, withSpring(1, { damping: 7, stiffness: 170, mass: 0.7 }));
    iconFloat.value = withDelay(900, withRepeat(withSequence(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
    ), -1, false));
  };

  useEffect(() => {
    // Entrance: spring in, then a little excited wiggle inviting the tap.
    boxScale.value = withSpring(1, { damping: 11, stiffness: 140 });
    boxRot.value = withDelay(500, withSequence(
      withTiming(-0.06, { duration: 90 }), withTiming(0.06, { duration: 90 }),
      withTiming(-0.05, { duration: 90 }), withTiming(0.04, { duration: 90 }), withTiming(0, { duration: 90 }),
    ));
    // Soft glow breathing behind the box until it's opened.
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 1000 }), withTiming(0.5, { duration: 1000 })), -1, false);
  }, [boxScale, boxRot, glow]);

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hop.value }, { scale: boxScale.value * kick.value }, { rotate: `${boxRot.value}rad` }],
  }));
  const lidStyle = useAnimatedStyle(() => ({
    opacity: lidOpacity.value,
    transform: [{ translateY: lidY.value }, { translateX: lidX.value }, { rotate: `${lidRot.value}rad` }],
  }));
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.value * 0.9, transform: [{ scale: 0.3 + burst.value * 3 }] }));
  const shockStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shock.value, [0, 0.1, 1], [0, 0.6, 0], CLAMP),
    transform: [{ scale: interpolate(shock.value, [0, 1], [0.3, 3.4], CLAMP) }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value * 0.55,
    transform: [{ scale: interpolate(glow.value, [0.5, 1], [1, 1.14], CLAMP) }],
  }));
  const revealStyle = useAnimatedStyle(() => ({ opacity: reveal.value, transform: [{ translateY: (1 - reveal.value) * 24 }] }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconPop.value }, { translateY: interpolate(iconFloat.value, [0, 1], [0, -6], CLAMP) }],
  }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: opened ? withTiming(0, { duration: 150 }) : 1 }));

  const goCollection = () => {
    if (!gift) { return; }
    navigation.replace('ExclusiveCollection', { collectionId: gift.collectionId });
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.close} hitSlop={12} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={26} color="rgba(255,255,255,0.9)" />
      </TouchableOpacity>

      {/* Idle glow breathing behind the box (until opened). */}
      <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none">
        <LinearGradient colors={['rgba(255,79,163,0.5)', 'rgba(160,92,255,0.25)', 'rgba(45,212,191,0)']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Burst flash behind the box. */}
      <Animated.View style={[styles.burst, burstStyle]} pointerEvents="none">
        <LinearGradient colors={['rgba(255,224,150,0.9)', 'rgba(255,79,163,0.4)', 'rgba(45,212,191,0)']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* Expanding shockwave ring thrown off on open. */}
      <Animated.View style={[styles.shock, shockStyle]} pointerEvents="none" />

      <Pressable onPress={pop} style={styles.boxArea}>
        <Animated.View style={[styles.box, boxStyle]}>
          {/* body */}
          <LinearGradient colors={FLOW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.boxBody}>
            <View style={styles.ribbonV} />
          </LinearGradient>
          {/* lid */}
          <Animated.View style={[styles.lid, lidStyle]}>
            <LinearGradient colors={['#FFE9A8', '#FFC93C', '#E8951E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.lidTop} />
            <View style={styles.bowL} />
            <View style={styles.bowR} />
          </Animated.View>
        </Animated.View>
        <Animated.Text style={[styles.tapHint, hintStyle]}>Tap to open</Animated.Text>
      </Pressable>

      {/* Particle burst — flies from the box center, over everything. */}
      <View style={styles.confetti} pointerEvents="none">
        {PARTICLES.map((p, i) => <ConfettiPiece key={i} p={p} progress={confetti} />)}
      </View>

      {/* reveal message + CTA */}
      <Animated.View style={[styles.reveal, revealStyle]} pointerEvents={opened ? 'auto' : 'none'}>
        <Animated.View style={[styles.giftIcon, iconStyle]}>
          <GradientIcon name="gift" size={52} />
        </Animated.View>
        <Text style={styles.revealTitle}>You’ve been awarded exclusive content!</Text>
        {gift && (
          <Text style={styles.revealSub}>
            <Text style={styles.revealStrong}>{gift.creatorName}</Text> sent you{'\n'}
            <Text style={styles.revealStrong}>“{gift.collectionName}”</Text> in {gift.channelName}
          </Text>
        )}
        <TouchableOpacity activeOpacity={0.9} onPress={goCollection} disabled={!gift} style={{ marginTop: SPACE.LG }}>
          <LinearGradient colors={FLOW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
            <Text style={styles.ctaTxt}>View collection</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(8,2,16,0.94)', alignItems: 'center', justifyContent: 'center' },
  close:    { position: 'absolute', top: 56, right: 22, zIndex: 10 },
  glow:     { position: 'absolute', width: 300, height: 300, borderRadius: 150, overflow: 'hidden', top: '50%', marginTop: -260 },
  burst:    { position: 'absolute', width: 320, height: 320, borderRadius: 160, overflow: 'hidden', top: '50%', marginTop: -240 },
  shock:    { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 4, borderColor: 'rgba(255,224,150,0.9)', top: '50%', marginTop: -220 },
  confetti: { position: 'absolute', top: '50%', left: '50%', width: 0, height: 0, marginTop: -120 },
  boxArea:  { alignItems: 'center', position: 'absolute', top: '50%', marginTop: -200 },
  box:      { width: 150, height: 130, alignItems: 'center' },
  boxBody:  { position: 'absolute', bottom: 0, width: 150, height: 100, borderRadius: 12, alignItems: 'center', overflow: 'hidden' },
  ribbonV:  { position: 'absolute', width: 22, height: '100%', backgroundColor: 'rgba(255,233,168,0.95)' },
  lid:      { position: 'absolute', top: 18, alignItems: 'center' },
  lidTop:   { width: 168, height: 34, borderRadius: 10 },
  bowL:     { position: 'absolute', top: -14, left: 50, width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFD24A', transform: [{ rotate: '-20deg' }] },
  bowR:     { position: 'absolute', top: -14, right: 50, width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFD24A', transform: [{ rotate: '20deg' }] },
  tapHint:  { color: 'rgba(255,255,255,0.6)', fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.SM, marginTop: SPACE.XL },

  reveal:      { alignItems: 'center', paddingHorizontal: SPACE.XL, position: 'absolute', bottom: '14%' },
  giftIcon:    { marginBottom: SPACE.SM },
  revealTitle: { color: C.WHITE, fontFamily: FONT.DISPLAY_BOLD, fontSize: FONT.SIZES.LG, textAlign: 'center' },
  revealSub:   { color: 'rgba(255,255,255,0.85)', fontFamily: FONT.BODY, fontSize: FONT.SIZES.MD, textAlign: 'center', marginTop: SPACE.SM, lineHeight: 22 },
  revealStrong:{ color: C.ACCENT_HOT, fontFamily: FONT.BODY_BOLD },
  cta:         { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, borderRadius: RADIUS.FULL },
  ctaTxt:      { color: C.WHITE, fontFamily: FONT.BODY_BOLD, paddingHorizontal: SPACE.XL, paddingVertical: SPACE.MD, fontSize: FONT.SIZES.MD },
});
