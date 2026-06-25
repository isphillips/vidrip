import React, { useEffect } from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withDelay,
  Easing, interpolate, Extrapolation, type SharedValue,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT } from '../../theme';

// ════════════════════════════════════════════════════════════════════════════════════════════
//  Slime-land scene kit — the shared visual world of Vidrip.
//
//  These are the reusable building blocks of the dusk slime-land first seen in the launch splash
//  (src/components/splash/SplashScene.tsx): twinkling stars, drifting bokeh, the glowing moon,
//  floating reaction-balloons, fireflies, the rolling parallax hills, Drippy's parametric crew of
//  MiniSlimes, and the HeroDrippy himself — plus a composable <SceneBackdrop> that assembles them
//  into one continuous, parallaxing backdrop. The splash and the cinematic onboarding both draw
//  from this kit so the user moves through a single, coherent fantasy world.
//
//  Pure Views + LinearGradient + Ionicons, animated with Reanimated UI-thread loops (no SVG, no
//  Skia) — cheap enough to run as a persistent background behind scrolling content.
// ════════════════════════════════════════════════════════════════════════════════════════════

export const { width: W, height: H } = Dimensions.get('window');
const logo = require('../../assets/driplogo.png');

// ── Palette (brand hues, tuned for a tasteful dusk-fantasy set) ───────────────────────────────
export const PINK = '#FF4FA3';
export const MAGENTA = C.ACCENT_HOT;  // #e056fd
export const PURPLE = C.ACCENT;       // #8b22a5
export const TEAL = C.TEAL;           // #2DD4BF
export const GOLD = '#FFD24A';
export const BLUE = '#6C7BFF';
export const BRAND: string[] = [PINK, MAGENTA, BLUE];

// Sky gradient stops (top → horizon) — the canonical dusk.
export const SKY = ['#160826', '#26104a', '#3a1763'];

// Drop into any Text style so copy reads cleanly over the busy scene (a soft dark halo around glyphs).
export const TEXT_GLOW = {
  textShadowColor: 'rgba(8,3,18,0.85)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 12,
};

// A feathered vertical dark band to sit behind a block of copy — guarantees contrast over the scene
// without a hard box (fades out top & bottom). Stretch it behind the text region.
export function CopyScrim({ style }: { style?: any }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={['rgba(9,4,20,0)', 'rgba(9,4,20,0.72)', 'rgba(9,4,20,0.74)', 'rgba(9,4,20,0.72)', 'rgba(9,4,20,0)']}
      locations={[0, 0.16, 0.5, 0.84, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[StyleSheet.absoluteFill, style]}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════════
//  Ambient sky pieces
// ════════════════════════════════════════════════════════════════════════════════════════════

// A twinkling star / sparkle that breathes and slowly turns.
export function Star({ left, top, size, color, delay, name = 'star' }: {
  left: number; top: number; size: number; color: string; delay: number; name?: string;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: 0.15 + t.value * 0.85,
    transform: [{ scale: 0.55 + t.value * 0.6 }, { rotate: `${t.value * 26}deg` }],
  }));
  return (
    <Animated.View style={[styles.abs, { left, top }, st]} pointerEvents="none">
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

// A soft out-of-focus bokeh orb that drifts and pulses — depth for the sky.
export function Bokeh({ left, top, size, color, delay }: {
  left: number; top: number; size: number; color: string; delay: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], [0.08, 0.26]),
    transform: [
      { translateY: interpolate(t.value, [0, 1], [10, -14]) },
      { translateX: interpolate(t.value, [0, 1], [-6, 8]) },
      { scale: 0.85 + t.value * 0.3 },
    ],
  }));
  return (
    <Animated.View
      style={[styles.abs, { left, top, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, st]}
      pointerEvents="none"
    />
  );
}

// The dreamy crescent moon — a glowing companion floating high in the slime-land sky.
export function Moon({ right = W * 0.12, top = H * 0.1 }: { right?: number; top?: number }) {
  const g = useSharedValue(0);
  useEffect(() => {
    g.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [g]);
  const glow = useAnimatedStyle(() => ({ opacity: 0.35 + g.value * 0.4, transform: [{ scale: 0.9 + g.value * 0.18 }] }));
  return (
    <View style={[styles.abs, { right, top }]} pointerEvents="none">
      <Animated.View style={[styles.moonGlow, glow]} />
      <View style={styles.moon} />
      <View style={styles.moonShade} />
    </View>
  );
}

// A reaction-balloon: a little gradient blob with a happy face drifting upward forever (a nod to
// Vidrip reactions floating off into the world).
export function Balloon({ startLeft, size, colors, face, delay, duration }: {
  startLeft: number; size: number; colors: string[]; face: 'smile' | 'heart' | 'wow'; delay: number; duration: number;
}) {
  const rise = useSharedValue(0);
  const sway = useSharedValue(0);
  useEffect(() => {
    rise.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
    sway.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [rise, sway, delay, duration]);
  const st = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(rise.value, [0, 1], [H * 0.72, -size * 1.5]) },
      { translateX: interpolate(sway.value, [0, 1], [-10, 10]) },
      { rotate: `${interpolate(sway.value, [0, 1], [-6, 6])}deg` },
    ],
    opacity: interpolate(rise.value, [0, 0.08, 0.85, 1], [0, 0.95, 0.95, 0], Extrapolation.CLAMP),
  }));
  const eyeTop = size * 0.34;
  return (
    <Animated.View style={[styles.abs, { left: startLeft, top: 0, width: size, height: size }, st]} pointerEvents="none">
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.balloonBody, { width: size, height: size }]} />
      <View style={[styles.balloonString, { top: size * 0.96, left: size / 2 - 0.75 }]} />
      {face === 'heart' ? (
        <>
          <Ionicons name="heart" size={size * 0.16} color="#fff" style={[styles.abs, { left: size * 0.26, top: eyeTop }]} />
          <Ionicons name="heart" size={size * 0.16} color="#fff" style={[styles.abs, { right: size * 0.26, top: eyeTop }]} />
        </>
      ) : (
        <>
          <View style={[styles.bEye, { left: size * 0.3, top: eyeTop }]} />
          <View style={[styles.bEye, { right: size * 0.3, top: eyeTop }]} />
        </>
      )}
      {face === 'wow'
        ? <View style={[styles.bMouthO, { left: size / 2 - size * 0.08, top: size * 0.56 }]} />
        : <View style={[styles.bSmile, { left: size / 2 - size * 0.14, top: size * 0.52 }]} />}
    </Animated.View>
  );
}

// A firefly: a tiny mote of light that rises and winks out.
export function Firefly({ startLeft, color, delay, duration }: { startLeft: number; color: string; delay: number; duration: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, false));
  }, [t, delay, duration]);
  const st = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0, 1], [H * 0.7, H * 0.4]) },
      { translateX: interpolate(t.value, [0, 0.5, 1], [0, 14, -6]) },
      { scale: 0.6 + Math.sin(t.value * Math.PI) * 0.6 },
    ],
    opacity: interpolate(t.value, [0, 0.15, 0.7, 1], [0, 1, 0.8, 0], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View style={[styles.abs, { left: startLeft, top: 0 }, st]} pointerEvents="none">
      <View style={[styles.firefly, { backgroundColor: color, shadowColor: color }]} />
    </Animated.View>
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════════
//  The rolling slime-hills (layered parallax silhouettes)
// ════════════════════════════════════════════════════════════════════════════════════════════

export function Hills({ enter }: { enter: SharedValue<number> }) {
  const sway = useSharedValue(0);
  useEffect(() => {
    sway.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [sway]);
  const back = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [40, 0]) },
      { translateX: interpolate(sway.value, [0, 1], [-8, 8]) },
    ],
    opacity: enter.value,
  }));
  const mid = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [55, 0]) },
      { translateX: interpolate(sway.value, [0, 1], [6, -6]) },
    ],
    opacity: enter.value,
  }));
  const front = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(enter.value, [0, 1], [70, 0]) }], opacity: enter.value }));
  return (
    <>
      <Animated.View style={[styles.hillBack, back]} pointerEvents="none">
        <LinearGradient colors={['#3a1a63', '#2a1149']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.hillMid, mid]} pointerEvents="none">
        <LinearGradient colors={['#2a1047', '#1c0a33']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.hillFront, front]} pointerEvents="none">
        <LinearGradient colors={['#190a30', '#0c0518']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════════
//  Mini slime friends — one parametric character, dressed up into Drippy's whole crew
// ════════════════════════════════════════════════════════════════════════════════════════════

export type Accessory = 'none' | 'wizard' | 'shades' | 'detective' | 'party' | 'bow' | 'crown' | 'headset' | 'director';

function renderAccessory(kind: Accessory, w: number) {
  switch (kind) {
    case 'wizard':
      return (
        <View style={[styles.abs, { top: -w * 0.62, left: w * 0.12, alignItems: 'center' }]} pointerEvents="none">
          <Ionicons name="star" size={w * 0.2} color={GOLD} style={{ marginBottom: -w * 0.04, zIndex: 2 }} />
          <View style={[styles.cone, { borderLeftWidth: w * 0.28, borderRightWidth: w * 0.28, borderBottomWidth: w * 0.6, borderBottomColor: '#4a2473' }]} />
          <View style={[styles.brim, { width: w * 0.8, backgroundColor: '#4a2473' }]} />
        </View>
      );
    case 'party':
      return (
        <View style={[styles.abs, { top: -w * 0.6, left: w * 0.18, alignItems: 'center' }]} pointerEvents="none">
          <View style={[styles.pompom, { backgroundColor: TEAL }]} />
          <View style={[styles.cone, { borderLeftWidth: w * 0.26, borderRightWidth: w * 0.26, borderBottomWidth: w * 0.56, borderBottomColor: PINK }]} />
          <View style={[styles.partyDot, { left: 2, backgroundColor: GOLD }]} />
          <View style={[styles.partyDot, { right: 2, top: w * 0.34, backgroundColor: TEAL }]} />
        </View>
      );
    case 'shades':
      return (
        <View style={[styles.abs, { top: w * 0.3, left: w * 0.25, flexDirection: 'row', alignItems: 'center' }]} pointerEvents="none">
          <View style={styles.lens} />
          <View style={styles.bridge} />
          <View style={styles.lens} />
        </View>
      );
    case 'detective':
      return (
        <View style={[styles.abs, { top: -w * 0.34, left: w * 0.06, alignItems: 'center' }]} pointerEvents="none">
          <View style={[styles.capDome, { width: w * 0.78, height: w * 0.34, backgroundColor: '#7a5c3e' }]} />
          <View style={[styles.capBrim, { width: w * 1.0, backgroundColor: '#6a4f35' }]} />
        </View>
      );
    case 'bow':
      return (
        <View style={[styles.abs, { top: -w * 0.16, left: w * 0.5 - w * 0.18, flexDirection: 'row' }]} pointerEvents="none">
          <View style={[styles.bowSide, { backgroundColor: MAGENTA }]} />
          <View style={[styles.bowKnot, { backgroundColor: '#fff' }]} />
          <View style={[styles.bowSide, { backgroundColor: MAGENTA }]} />
        </View>
      );
    case 'crown':
      return (
        <View style={[styles.abs, { top: -w * 0.34, left: w * 0.5 - w * 0.26, width: w * 0.52, alignItems: 'center' }]} pointerEvents="none">
          <Ionicons name="diamond" size={w * 0.5} color={GOLD} />
        </View>
      );
    case 'headset':
      return (
        <View style={[styles.abs, { top: -w * 0.08, left: w * 0.5 - w * 0.42, width: w * 0.84, height: w * 0.7 }]} pointerEvents="none">
          <View style={[styles.headBand, { borderColor: '#2a2030', width: w * 0.84, height: w * 0.5, borderRadius: w * 0.42 }]} />
          <View style={[styles.headCup, { left: -w * 0.04, top: w * 0.34, width: w * 0.18, height: w * 0.24, backgroundColor: '#15101c' }]} />
          <View style={[styles.headCup, { right: -w * 0.04, top: w * 0.34, width: w * 0.18, height: w * 0.24, backgroundColor: '#15101c' }]} />
        </View>
      );
    case 'director':
      // a tiny beret-ish cap, tilted
      return (
        <View style={[styles.abs, { top: -w * 0.26, left: w * 0.2, transform: [{ rotate: '-12deg' }] }]} pointerEvents="none">
          <View style={[styles.beret, { width: w * 0.6, height: w * 0.3, backgroundColor: '#1c1430' }]} />
          <View style={[styles.beretNub, { backgroundColor: GOLD }]} />
        </View>
      );
    default:
      return null;
  }
}

export function MiniSlime({ left, top, size, colors, accessory = 'none', delay, waves = false, mouth = 'smile', sparkle = false }: {
  left: number; top: number; size: number; colors: string[]; accessory?: Accessory;
  delay: number; waves?: boolean; mouth?: 'smile' | 'grin' | 'none'; sparkle?: boolean;
}) {
  const bob = useSharedValue(0);
  const blink = useSharedValue(1);
  const wave = useSharedValue(0);
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withDelay(delay, withTiming(1, { duration: 460, easing: Easing.out(Easing.back(1.7)) }));
    bob.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1500 + (size % 7) * 60, easing: Easing.inOut(Easing.quad) }), -1, true));
    blink.value = withDelay(delay + 600, withRepeat(withSequence(
      withDelay(1800 + (size % 5) * 400, withTiming(1, { duration: 30 })),
      withTiming(0.08, { duration: 70 }),
      withTiming(1, { duration: 90 }),
    ), -1, false));
    if (waves) {
      wave.value = withDelay(delay, withRepeat(withSequence(
        withTiming(1, { duration: 320, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 320, easing: Easing.inOut(Easing.quad) }),
      ), -1, false));
    }
  }, [bob, blink, wave, enter, delay, size, waves]);

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: interpolate(bob.value, [0, 1], [0, -size * 0.12]) },
      { rotate: `${interpolate(bob.value, [0, 1], [-3, 3])}deg` },
      { scaleY: interpolate(bob.value, [0, 1], [1, 1.04]) },
      { scale: enter.value },
    ],
  }));
  const lid = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const armStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(wave.value, [0, 1], [-6, 40])}deg` }] }));

  const eyeD = Math.max(5, size * 0.16);
  const eyeTop = size * 0.36;
  return (
    <View style={[styles.abs, { left, top, width: size, height: size, alignItems: 'center' }]} pointerEvents="none">
      <View style={[styles.contact, { width: size * 0.7, top: size * 0.96 }]} />
      <Animated.View style={[{ width: size, height: size }, bodyStyle]}>
        <LinearGradient
          colors={colors}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={{
            width: size, height: size,
            borderTopLeftRadius: size * 0.5, borderTopRightRadius: size * 0.5,
            borderBottomLeftRadius: size * 0.34, borderBottomRightRadius: size * 0.44,
          }}
        />
        <View style={[styles.msEye, { left: size * 0.28 - eyeD / 2, top: eyeTop, width: eyeD, height: eyeD, borderRadius: eyeD / 2 }]}>
          <Animated.View style={[styles.msEyeWhite, lid]}><View style={[styles.msPupil, { width: eyeD * 0.5, height: eyeD * 0.5, borderRadius: eyeD * 0.25 }]} /></Animated.View>
        </View>
        <View style={[styles.msEye, { right: size * 0.28 - eyeD / 2, top: eyeTop, width: eyeD, height: eyeD, borderRadius: eyeD / 2 }]}>
          <Animated.View style={[styles.msEyeWhite, lid]}><View style={[styles.msPupil, { width: eyeD * 0.5, height: eyeD * 0.5, borderRadius: eyeD * 0.25 }]} /></Animated.View>
        </View>
        {mouth === 'smile' && <View style={[styles.msSmile, { left: size / 2 - size * 0.13, top: size * 0.56, width: size * 0.26 }]} />}
        {mouth === 'grin' && <View style={[styles.msGrin, { left: size / 2 - size * 0.16, top: size * 0.56, width: size * 0.32 }]} />}
        {waves && (
          <Animated.View style={[styles.abs, { right: -size * 0.12, top: size * 0.32, width: size * 0.3, height: size * 0.3 }, armStyle]}>
            <View style={[styles.msArm, { backgroundColor: colors[1] }]} />
          </Animated.View>
        )}
        {renderAccessory(accessory, size)}
      </Animated.View>
      {sparkle && (
        <>
          <Star left={size * 0.9} top={-size * 0.1} size={size * 0.22} color={GOLD} delay={delay + 200} name="sparkles" />
          <Star left={-size * 0.2} top={size * 0.3} size={size * 0.16} color={TEAL} delay={delay + 700} name="sparkles" />
        </>
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════════
//  Hero Drippy — the star. Renders the character centred in a width×height box; the caller positions it.
// ════════════════════════════════════════════════════════════════════════════════════════════

export const HERO_W_DEFAULT = Math.min(140, W * 0.34);

export function HeroDrippy({ enter, width = HERO_W_DEFAULT, waving = true }: { enter: SharedValue<number>; width?: number; waving?: boolean }) {
  const height = Math.round((width * 321) / 194);
  const bob = useSharedValue(0);
  const wave = useSharedValue(0);
  const blink = useSharedValue(1);
  const halo = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true);
    if (waving) {
      wave.value = withRepeat(withSequence(
        withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 300, easing: Easing.inOut(Easing.quad) }),
      ), -1, false);
    }
    blink.value = withRepeat(withSequence(
      withDelay(2400, withTiming(1, { duration: 30 })),
      withTiming(0.1, { duration: 70 }),
      withTiming(1, { duration: 90 }),
    ), -1, false);
    halo.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [bob, wave, blink, halo, waving]);

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: interpolate(bob.value, [0, 1], [0, -10]) },
      { rotate: `${interpolate(bob.value, [0, 1], [-2.5, 2.5])}deg` },
      { scaleY: interpolate(bob.value, [0, 1], [1, 1.035]) },
      { scale: interpolate(enter.value, [0, 1], [0.78, 1]) },
    ],
  }));
  const armStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(wave.value, [0, 1], [-10, 36])}deg` }] }));
  const lid = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: (0.32 + halo.value * 0.4) * enter.value, transform: [{ scale: 0.9 + halo.value * 0.16 }] }));

  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      <Animated.View style={[styles.heroHalo, { width: width * 2.1, height: width * 2.1, borderRadius: width, top: -width * 0.25 }, haloStyle]} />
      <Animated.View style={[{ width, height }, bodyStyle]}>
        <Image source={logo} style={{ width, height }} resizeMode="contain" />
        <View style={[styles.heroEye, { left: width * 0.31, top: height * 0.12, width: width * 0.16, height: width * 0.16 }]}>
          <Animated.View style={[styles.heroEyeWhite, lid]}><View style={styles.heroPupil} /><View style={styles.heroGlint} /></Animated.View>
        </View>
        <View style={[styles.heroEye, { left: width * 0.53, top: height * 0.12, width: width * 0.16, height: width * 0.16 }]}>
          <Animated.View style={[styles.heroEyeWhite, lid]}><View style={styles.heroPupil} /><View style={styles.heroGlint} /></Animated.View>
        </View>
        <Animated.View style={[styles.heroArmPivot, { left: width * 0.72, top: height * 0.2 }, armStyle]}>
          <LinearGradient colors={[PINK, MAGENTA]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={styles.heroArm} />
          <LinearGradient colors={[PINK, MAGENTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroHand} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════════
//  <SceneBackdrop> — the full, continuous slime-land, assembled and (optionally) parallaxing.
//  Drop it as an absolute-fill background behind scrolling content. Pass `enter` (mount animation)
//  and an optional `scrollX` (px) shared value to make the depth layers drift as the user swipes.
// ════════════════════════════════════════════════════════════════════════════════════════════

export function SceneBackdrop({ enter, scrollX, showCrew = true }: {
  enter: SharedValue<number>; scrollX?: SharedValue<number>; showCrew?: boolean;
}) {
  const zero = useSharedValue(0);
  const sx = scrollX ?? zero;
  // Depth: far layer drifts least, foreground crew most (classic parallax).
  const farStyle = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateX: -sx.value * 0.03 }] }));
  const midStyle = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateX: -sx.value * 0.07 }] }));
  const crewStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -sx.value * 0.16 }] }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={SKY} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* warm horizon glow where the hills meet the sky */}
      <LinearGradient
        colors={['rgba(224,86,253,0)', 'rgba(224,86,253,0.2)', 'rgba(45,212,191,0.14)']}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={styles.horizon}
      />

      {/* far layer: moon, stars, bokeh */}
      <Animated.View style={[StyleSheet.absoluteFill, farStyle]}>
        <Moon />
        <Star left={W * 0.12} top={H * 0.1} size={20} color={TEAL} delay={0} />
        <Star left={W * 0.34} top={H * 0.06} size={13} color={MAGENTA} delay={400} name="sparkles" />
        <Star left={W * 0.62} top={H * 0.05} size={15} color="#fff" delay={250} />
        <Star left={W * 0.84} top={H * 0.18} size={12} color={GOLD} delay={700} name="sparkles" />
        <Star left={W * 0.08} top={H * 0.26} size={11} color={MAGENTA} delay={950} />
        <Star left={W * 0.5} top={H * 0.16} size={10} color={TEAL} delay={1200} name="sparkles" />
        <Star left={W * 0.72} top={H * 0.3} size={12} color="#fff" delay={550} />
        <Star left={W * 0.26} top={H * 0.34} size={9} color={GOLD} delay={1450} />
        <Bokeh left={W * 0.18} top={H * 0.2} size={90} color={MAGENTA} delay={0} />
        <Bokeh left={W * 0.66} top={H * 0.12} size={120} color={BLUE} delay={800} />
        <Bokeh left={W * 0.4} top={H * 0.4} size={70} color={TEAL} delay={1600} />
      </Animated.View>

      {/* rolling hills */}
      <Hills enter={enter} />

      {/* mid layer: fireflies + reaction balloons (in front of the hills) */}
      <Animated.View style={[StyleSheet.absoluteFill, midStyle]}>
        <Firefly startLeft={W * 0.3} color={GOLD} delay={0} duration={6000} />
        <Firefly startLeft={W * 0.6} color={TEAL} delay={1800} duration={7200} />
        <Firefly startLeft={W * 0.46} color={MAGENTA} delay={3600} duration={6600} />
        <Firefly startLeft={W * 0.82} color={GOLD} delay={900} duration={8000} />
        <Balloon startLeft={W * 0.16} size={44} colors={[PINK, MAGENTA]} face="heart" delay={300} duration={9000} />
        <Balloon startLeft={W * 0.78} size={38} colors={[TEAL, '#2563EB']} face="smile" delay={2600} duration={11000} />
        <Balloon startLeft={W * 0.52} size={34} colors={[GOLD, '#FF8A3D']} face="wow" delay={5200} duration={10000} />
      </Animated.View>

      {/* the crew, loafing on the hills */}
      {showCrew && (
        <Animated.View style={[StyleSheet.absoluteFill, crewStyle]}>
          <MiniSlime left={W * 0.06} top={H * 0.62} size={48} colors={[PURPLE, '#4a2473']} accessory="wizard" delay={520} sparkle mouth="smile" />
          <MiniSlime left={W * 0.78} top={H * 0.6} size={54} colors={[TEAL, '#1f9c8c']} accessory="shades" delay={680} mouth="grin" />
          <MiniSlime left={W * 0.26} top={H * 0.7} size={40} colors={[GOLD, '#E08A1E']} accessory="party" delay={840} sparkle mouth="grin" />
          <MiniSlime left={W * 0.88} top={H * 0.72} size={36} colors={[PINK, MAGENTA]} accessory="bow" delay={980} waves mouth="smile" />
          <MiniSlime left={W * 0.02} top={H * 0.74} size={38} colors={['#5aa9ff', '#2563EB']} accessory="detective" delay={1120} mouth="smile" />
        </Animated.View>
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  horizon: { position: 'absolute', left: 0, right: 0, top: H * 0.42, height: H * 0.3 },

  moonGlow: { position: 'absolute', left: -18, top: -18, width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(255,210,74,0.25)' },
  moon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FBE7B0' },
  moonShade: { position: 'absolute', left: 16, top: -4, width: 56, height: 56, borderRadius: 28, backgroundColor: '#26104a' },

  balloonBody: { borderTopLeftRadius: 99, borderTopRightRadius: 99, borderBottomLeftRadius: 80, borderBottomRightRadius: 90 },
  balloonString: { position: 'absolute', width: 1.5, height: 18, backgroundColor: 'rgba(255,255,255,0.35)' },
  bEye: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#1a0b22' },
  bSmile: { position: 'absolute', width: 16, height: 8, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderWidth: 2, borderColor: '#1a0b22', borderTopWidth: 0 },
  bMouthO: { position: 'absolute', width: 10, height: 11, borderRadius: 6, backgroundColor: '#1a0b22' },

  firefly: { width: 5, height: 5, borderRadius: 3, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 6 },

  hillBack: { position: 'absolute', left: -W * 0.15, right: -W * 0.15, top: H * 0.6, height: H * 0.5, borderTopLeftRadius: W * 0.7, borderTopRightRadius: W * 0.5, overflow: 'hidden' },
  hillMid: { position: 'absolute', left: -W * 0.2, right: -W * 0.1, top: H * 0.68, height: H * 0.45, borderTopLeftRadius: W * 0.55, borderTopRightRadius: W * 0.8, overflow: 'hidden' },
  hillFront: { position: 'absolute', left: -W * 0.1, right: -W * 0.2, top: H * 0.78, height: H * 0.4, borderTopLeftRadius: W * 0.9, borderTopRightRadius: W * 0.6, overflow: 'hidden' },

  contact: { position: 'absolute', height: 7, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.28)' },
  msEye: { position: 'absolute', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  msEyeWhite: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 99 },
  msPupil: { backgroundColor: '#1a0b22' },
  msSmile: { position: 'absolute', height: 9, borderBottomLeftRadius: 9, borderBottomRightRadius: 9, borderWidth: 2, borderColor: 'rgba(26,11,34,0.8)', borderTopWidth: 0 },
  msGrin: { position: 'absolute', height: 11, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: 'rgba(26,11,34,0.85)' },
  msArm: { width: '70%', height: '34%', borderRadius: 8, position: 'absolute', bottom: 0, transform: [{ rotate: '-30deg' }] },

  cone: { width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  brim: { height: 5, borderRadius: 4, marginTop: -2 },
  pompom: { width: 9, height: 9, borderRadius: 5, marginBottom: -2, zIndex: 2 },
  partyDot: { position: 'absolute', width: 5, height: 5, borderRadius: 3, top: 6 },
  lens: { width: 13, height: 11, borderRadius: 5, backgroundColor: '#15101c', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  bridge: { width: 5, height: 2.5, backgroundColor: '#15101c' },
  capDome: { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  capBrim: { height: 5, borderRadius: 4, marginTop: -1 },
  bowSide: { width: 9, height: 12, borderRadius: 4 },
  bowKnot: { width: 6, height: 8, borderRadius: 3, marginHorizontal: -1, zIndex: 2 },
  headBand: { position: 'absolute', borderWidth: 4, borderBottomColor: 'transparent', top: 0, alignSelf: 'center' },
  headCup: { position: 'absolute', borderRadius: 4 },
  beret: { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderBottomLeftRadius: 14, borderBottomRightRadius: 30 },
  beretNub: { position: 'absolute', top: -3, right: 6, width: 6, height: 6, borderRadius: 3 },

  heroHalo: { position: 'absolute', backgroundColor: 'rgba(224,86,253,0.16)' },
  heroEye: { position: 'absolute' },
  heroEyeWhite: { width: '100%', height: '100%', borderRadius: 99, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  heroPupil: { width: '45%', height: '45%', borderRadius: 99, backgroundColor: '#1a0b22' },
  heroGlint: { position: 'absolute', top: '20%', right: '20%', width: '20%', height: '20%', borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.9)' },
  heroArmPivot: { position: 'absolute', width: 32, height: 32 },
  heroArm: { position: 'absolute', left: 2, bottom: 4, width: 20, height: 8, borderRadius: 5, transform: [{ rotate: '-32deg' }] },
  heroHand: { position: 'absolute', right: 0, top: 0, width: 13, height: 13, borderRadius: 7 },
});

// Re-export the FONT helper for scene-built screens that want matching type.
export { FONT };
