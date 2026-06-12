import React, { useEffect, useRef } from 'react';
import {
  View, Image, StyleSheet, TouchableOpacity, Text, Animated, Easing, useWindowDimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT, SPACE, RADIUS, C } from '../../../theme';
import type { AuthStackScreenProps } from '../../../app/navigation/types';

const logo = require('../../../assets/driplogo.png');
const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

// Per-letter color steps for the "drip" wordmark — sampled from the logo's
// pink→purple gradient. Stable objects so they aren't inline styles.
const DRIP_COLORS = [{ color: '#E73D93' }, { color: '#CF3EA7' }, { color: '#B83EBC' }, { color: '#A03FD0' }];

// ── Lava lamp ─────────────────────────────────────────────────────────────────
// Slow morphing blobs that rise + fall and drift sideways, filled with the brand
// pink→purple gradient. iOS colored shadows give the soft glowing "lava" edges;
// every transform is native-driven so it stays smooth.
type BlobCfg = {
  size: number;       // diameter (px)
  leftPct: number;    // horizontal anchor, 0..1 of screen width
  colorA: string; colorB: string;
  duration: number;   // full rise+fall loop (ms)
  delay: number;      // desync start
  drift: number;      // sideways travel (px)
};

const BLOBS: BlobCfg[] = [
  { size: 260, leftPct: 0.18, colorA: '#E73D93', colorB: '#A03FD0', duration: 30000, delay: 0,    drift: 30 },
  { size: 200, leftPct: 0.72, colorA: '#FF2D8B', colorB: '#C42BC3', duration: 36000, delay: 1800, drift: 24 },
  { size: 300, leftPct: 0.50, colorA: '#C42BC3', colorB: '#7B2FF0', duration: 44000, delay: 3600, drift: 36 },
  { size: 160, leftPct: 0.85, colorA: '#E0409F', colorB: '#A03FD0', duration: 26000, delay: 900,  drift: 20 },
  { size: 220, leftPct: 0.30, colorA: '#B83EBC', colorB: '#8E44AD', duration: 38000, delay: 5200, drift: 28 },
  { size: 140, leftPct: 0.60, colorA: '#FF5FA2', colorB: '#C42BC3', duration: 23000, delay: 2600, drift: 16 },
];

function Blob({ cfg, screenW, screenH }: { cfg: BlobCfg; screenW: number; screenH: number }) {
  // `t` drives motion (native driver); `morph` reshapes the silhouette by animating
  // the four corner radii (JS driver — border radii can't run natively). They loop
  // on different durations so shape and motion stay out of sync → organic.
  const t = useRef(new Animated.Value(0)).current;
  const morph = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const motion = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: cfg.duration,
        delay: cfg.delay,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    );
    const shape = Animated.loop(
      Animated.timing(morph, {
        toValue: 1,
        duration: cfg.duration * 0.3,   // much faster than the slow rise → active, bubbly wobble
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: false,
      }),
    );
    motion.start();
    shape.start();
    return () => { motion.stop(); shape.stop(); };
  }, [t, morph, cfg]);

  // Rise from below the screen to above it, then back down.
  const translateY = t.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [screenH + cfg.size * 0.5, -cfg.size * 0.5, screenH + cfg.size * 0.5],
  });
  const translateX = t.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, cfg.drift, 0, -cfg.drift, 0],
  });
  // Stronger squash/stretch driven by the (fast) morph so it pulses like a bubble.
  const scaleY = morph.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 1.28, 0.82, 1.2, 1] });
  const scaleX = morph.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 0.78, 1.22, 0.84, 1] });
  // Slow sway so the morphing silhouette keeps reorienting.
  const rotate = t.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ['0deg', '18deg', '0deg', '-18deg', '0deg'],
  });

  // Each corner swings hard between ~20% and ~72% on its own phase, returning to
  // 50% (a circle) at the loop ends so the wrap stays seamless. The bigger the
  // spread + the out-of-phase corners, the more it pinches into bubble shapes.
  const r = cfg.size;
  const corner = (out: number[]) =>
    morph.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: out.map(f => f * r) });
  const borderTopLeftRadius     = corner([0.5, 0.25, 0.70, 0.20, 0.62, 0.5]);
  const borderTopRightRadius    = corner([0.5, 0.68, 0.22, 0.72, 0.30, 0.5]);
  const borderBottomRightRadius = corner([0.5, 0.30, 0.66, 0.25, 0.70, 0.5]);
  const borderBottomLeftRadius  = corner([0.5, 0.72, 0.28, 0.64, 0.22, 0.5]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.blob,
        {
          width: cfg.size,
          height: cfg.size,
          borderRadius: cfg.size / 2,   // soft circular glow halo behind the shape
          left: cfg.leftPct * screenW - cfg.size / 2,
          shadowColor: cfg.colorB,
          shadowRadius: cfg.size * 0.22,
          transform: [{ translateX }, { translateY }, { rotate }],
        },
      ]}>
      <AnimatedGradient
        colors={[cfg.colorA, cfg.colorB]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.blobFill,
          {
            borderTopLeftRadius, borderTopRightRadius, borderBottomRightRadius, borderBottomLeftRadius,
            // JS-driven scale lives with the JS-driven radii (can't mix with the
            // native translate/rotate on the outer view).
            transform: [{ scaleX }, { scaleY }],
          },
        ]}
      />
    </Animated.View>
  );
}

function LavaLamp() {
  const { width, height } = useWindowDimensions();
  return (
    <View style={styles.lava} pointerEvents="none">
      {/* Dark diagonal purple base */}
      <LinearGradient
        colors={['#2A0E4E', '#190A33', '#0B0518']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {BLOBS.map((cfg, i) => (
        <Blob key={i} cfg={cfg} screenW={width} screenH={height} />
      ))}
      {/* Subtle scrim to keep text legible over bright blobs */}
      <View style={styles.scrim} />
    </View>
  );
}

export default function WelcomeScreen({ navigation }: AuthStackScreenProps<'Welcome'>) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <LavaLamp />
      <View style={[styles.content, { paddingTop: top + SPACE.LG }]}>
        <View style={styles.hero}>
          <Text style={styles.wordmark}>
            <Text style={styles.titleVi}>Vi</Text>
            {'drip '.split('').map((ch, i) => (
              <Text key={i} style={DRIP_COLORS[i]}>{ch}</Text>
            ))}
          </Text>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.tagline}>Share videos.{'\n'}Get reactions.</Text>
        </View>
        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('EnterInviteCode')}>
          <LinearGradient
            colors={['#E73D93', '#A03FD0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.buttonInner}>
            <Text style={styles.buttonText}>Enter Invitation Code</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.signInLink}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('SignIn')}>
          <Text style={styles.signInText}>Already have an account? Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  lava: { ...StyleSheet.absoluteFillObject },
  blob: {
    position: 'absolute',
    top: 0,
    shadowOpacity: 0.9,
    shadowOffset: { width: 0, height: 0 },
    opacity: 0.85,
  },
  blobFill: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,4,12,0.28)' },

  content: {
    flex: 1,
    justifyContent: 'space-between',
    padding: SPACE.XL,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACE.MD,
  },
  wordmark: {
    fontSize: 52,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.WHITE,
    letterSpacing: -1.5,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  titleVi: { color: C.WHITE },
  logo: {
    width: 240,
    height: 240,
  },
  tagline: {
    fontSize: FONT.SIZES.XL,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.WHITE,
    textAlign: 'center',
    lineHeight: 30,
    letterSpacing: 0.5,
  },
  button: {
    borderRadius: RADIUS.MD,
    overflow: 'hidden',
    marginBottom: SPACE.MD,
    marginTop: -30,
    width: '90%',
    alignSelf: 'center',
  },
  buttonInner: {
    padding: SPACE.LG,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: FONT.SIZES.LG,
    fontFamily: FONT.BODY_BOLD,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.WHITE,
  },
  signInLink: {
    alignItems: 'center',
    padding: SPACE.SM,
  },
  signInText: {
    color: C.WHITE,
    fontSize: FONT.SIZES.MD,
    fontFamily: FONT.BODY,
    marginBottom: SPACE.XXL,
  },
});
