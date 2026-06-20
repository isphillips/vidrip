import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, useWindowDimensions, Animated, Easing } from 'react-native';
import {
  Canvas, Fill, Group, Circle, vec, Blur, ColorMatrix, Paint,
  LinearGradient as SkiaGradient, useClock, useImage, Image as SkImage,
  useFont, Text as SkiaText,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT, SPACE, RADIUS, C } from '../../../theme';
import GradientButton from '../../studio/components/GradientButton';
import type { AuthStackScreenProps } from '../../../app/navigation/types';

const logo = require('../../../assets/driplogo.png');

// Per-letter color steps for the "drip" wordmark — sampled from the logo's gradient.
const DRIP_COLORS = [{ color: '#E73D93' }, { color: '#CF3EA7' }, { color: '#B83EBC' }, { color: '#A03FD0' }];

// ── Lava lamp (Skia metaball) ───────────────────────────────────────────────
// Big blobs and bubbles are drawn into blurred layers, then an alpha-threshold color
// matrix re-sharpens the blurred alpha. Where two blurred shapes overlap their alpha
// sums past the threshold, so they fuse into one gooey silhouette — true lava-lamp
// merging. All motion runs on a Skia clock (UI thread) so it stays smooth.

// Gooey filter: blur spreads alpha, the matrix multiplies alpha steeply and offsets it
// so only the dense (overlapping) regions survive → merged metaballs. RGB rows are
// identity, so blob colors blend naturally in the overlap.
const goo = (mul: number, off: number) => [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, mul, off,
];

type BlobCfg = {
  r: number;        // radius (px)
  x: number;        // horizontal anchor (0..1 of width)
  baseY: number;    // vertical centre of its slow bob (0..1 of height)
  amp: number;      // vertical travel (px)
  period: number;   // bob period (ms)
  phase: number;    // 0..1 start offset → blobs are spread across the screen at mount
  drift: number;    // sideways travel (px)
  color: string;
};

// Phases are spread 0..1 so on the very first frame the blobs already sit at different
// heights across the middle of the screen (not stacked below it).
const BLOBS: BlobCfg[] = [
  { r: 130, x: 0.22, baseY: 0.40, amp: 150, period: 13000, phase: 0.00, drift: 34, color: '#E73D93' },
  { r: 105, x: 0.74, baseY: 0.55, amp: 175, period: 16000, phase: 0.30, drift: 28, color: '#FF2D8B' },
  { r: 155, x: 0.50, baseY: 0.50, amp: 200, period: 19000, phase: 0.60, drift: 40, color: '#A03FD0' },
  { r:  92, x: 0.85, baseY: 0.38, amp: 150, period: 12000, phase: 0.18, drift: 22, color: '#C42BC3' },
  { r: 120, x: 0.32, baseY: 0.62, amp: 185, period: 17000, phase: 0.78, drift: 30, color: '#7B2FF0' },
  { r:  82, x: 0.60, baseY: 0.45, amp: 165, period: 11000, phase: 0.45, drift: 18, color: '#FF5FA2' },
];

// Small bubbles of varied size constantly rising + wrapping, for depth in front.
const BUBBLES = Array.from({ length: 14 }, (_, i) => ({
  r: 5 + ((i * 7) % 17),                 // 5..21 px, varied
  x: ((i * 0.137 + 0.06) % 1),           // spread across width
  period: 7000 + ((i * 1300) % 8000),    // 7s..15s rise
  phase: (i * 0.0719) % 1,
  drift: 10 + ((i * 5) % 22),
  color: i % 3 === 0 ? '#FF8FC4' : i % 3 === 1 ? '#C98BFF' : '#FF5FA2',
}));

function Blob({ cfg, clock, w, h }: { cfg: BlobCfg; clock: ReturnType<typeof useClock>; w: number; h: number }) {
  const c = useDerivedValue(() => {
    const t = clock.value;
    const cy = cfg.baseY * h + cfg.amp * Math.sin(2 * Math.PI * (t / cfg.period + cfg.phase));
    const cx = cfg.x * w + cfg.drift * Math.sin(2 * Math.PI * (t / (cfg.period * 0.7) + cfg.phase));
    return vec(cx, cy);
  });
  return <Circle c={c} r={cfg.r} color={cfg.color} />;
}

function Bubble({ cfg, clock, w, h }: { cfg: typeof BUBBLES[number]; clock: ReturnType<typeof useClock>; w: number; h: number }) {
  const c = useDerivedValue(() => {
    const t = clock.value;
    const span = h + cfg.r * 2;
    const p = (((t / cfg.period + cfg.phase) % 1) + 1) % 1;   // 0..1 rising
    const cy = h + cfg.r - p * span;
    const cx = cfg.x * w + cfg.drift * Math.sin(2 * Math.PI * (t / (cfg.period * 0.5) + cfg.phase));
    return vec(cx, cy);
  });
  return <Circle c={c} r={cfg.r} color={cfg.color} />;
}

// Mini slime friends (from the tab bar) swimming around — a body + googly eyes,
// wandering on a slow Lissajous path with a gentle squash-and-stretch.
const SLIMES = [
  { r: 26, baseX: 0.28, baseY: 0.60, ax: 64, ay: 46, px: 17000, py: 13000, phase: 0.10, color: '#FF4FA3' },
  { r: 19, baseX: 0.74, baseY: 0.30, ax: 74, ay: 52, px: 15000, py: 19000, phase: 0.52, color: '#A05CFF' },
  { r: 30, baseX: 0.56, baseY: 0.80, ax: 54, ay: 44, px: 21000, py: 16000, phase: 0.80, color: '#E056FD' },
  { r: 15, baseX: 0.16, baseY: 0.36, ax: 58, ay: 38, px: 13000, py: 14500, phase: 0.33, color: '#FF5FA2' },
];

function Slime({ cfg, clock, w, h }: { cfg: typeof SLIMES[number]; clock: ReturnType<typeof useClock>; w: number; h: number }) {
  const transform = useDerivedValue(() => {
    const t = clock.value;
    const cx = cfg.baseX * w + cfg.ax * Math.sin(2 * Math.PI * (t / cfg.px + cfg.phase));
    const cy = cfg.baseY * h + cfg.ay * Math.sin(2 * Math.PI * (t / cfg.py + cfg.phase * 1.7));
    const squash = 1 + 0.07 * Math.sin(2 * Math.PI * (t / 2300 + cfg.phase));
    return [{ translateX: cx }, { translateY: cy }, { scaleY: squash }, { scaleX: 2 - squash }];
  });
  const R = cfg.r;
  return (
    <Group transform={transform}>
      <Circle cx={0} cy={0} r={R} color={cfg.color} />
      {/* googly eyes */}
      <Circle cx={-R * 0.34} cy={-R * 0.12} r={R * 0.3} color="#FFFFFF" />
      <Circle cx={R * 0.34} cy={-R * 0.12} r={R * 0.3} color="#FFFFFF" />
      <Circle cx={-R * 0.32} cy={-R * 0.04} r={R * 0.14} color="#1A0E2E" />
      <Circle cx={R * 0.36} cy={-R * 0.04} r={R * 0.14} color="#1A0E2E" />
    </Group>
  );
}

function LavaLamp() {
  const { width: w, height: h } = useWindowDimensions();
  const clock = useClock();
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      {/* Dark diagonal purple base */}
      <Fill>
        <SkiaGradient start={vec(0, 0)} end={vec(w, h)} colors={['#2A0E4E', '#190A33', '#0B0518']} />
      </Fill>

      {/* Big lava blobs — heavy blur + steep threshold makes them fuse where they meet. */}
      <Group
        opacity={0.92}
        layer={
          <Paint>
            <Blur blur={26} />
            <ColorMatrix matrix={goo(34, -13)} />
          </Paint>
        }>
        {BLOBS.map((cfg, i) => <Blob key={i} cfg={cfg} clock={clock} w={w} h={h} />)}
      </Group>

      {/* Foreground bubbles — lighter blur so the small ones stay crisp and read as depth. */}
      <Group
        opacity={0.55}
        layer={
          <Paint>
            <Blur blur={6} />
            <ColorMatrix matrix={goo(22, -7)} />
          </Paint>
        }>
        {BUBBLES.map((cfg, i) => <Bubble key={i} cfg={cfg} clock={clock} w={w} h={h} />)}
      </Group>

      {/* Slime friends swimming through the lava. */}
      <Group opacity={0.8}>
        {SLIMES.map((cfg, i) => <Slime key={i} cfg={cfg} clock={clock} w={w} h={h} />)}
      </Group>
    </Canvas>
  );
}

// Logo box (px) and the larger glow canvas around it (room for the blur to bloom).
const LOGO = 240;
const GLOW = 320;
const GLOW_PAD = (GLOW - LOGO) / 2;
// Darken the blurred logo to a soft silhouette (RGB→0, alpha kept) for a shape-tracing
// drop shadow with no boxy edges.
const SHADOW_MATRIX = [
  0, 0, 0, 0, 0,
  0, 0, 0, 0, 0,
  0, 0, 0, 0, 0,
  0, 0, 0, 0.6, 0,
];
// Darker, denser variant for the wordmark glow (near-opaque black silhouette).
const WORDMARK_SHADOW_MATRIX = [
  0, 0, 0, 0, 0,
  0, 0, 0, 0, 0,
  0, 0, 0, 0, 0,
  0, 0, 0, 1.6, 0,
];

const WM_PAD = 26; // room around the wordmark for its glow to bloom

export default function WelcomeScreen({ navigation }: AuthStackScreenProps<'Welcome'>) {
  const { top } = useSafeAreaInsets();
  const logoImg = useImage(logo);
  const syne = useFont(require('../../../assets/fonts/Syne-Bold.ttf'), 52);
  const [wm, setWm] = useState({ w: 0, h: 0 }); // measured wordmark size → glow canvas

  // enter: one-shot pop-in on mount. breathe/tag: infinite gentle loops.
  const enter = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const tag = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, tension: 45, friction: 7, useNativeDriver: true }).start();
    const breatheLoop = Animated.loop(
      Animated.timing(breathe, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    );
    const tagLoop = Animated.loop(
      Animated.timing(tag, { toValue: 1, duration: 3600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    );
    breatheLoop.start();
    tagLoop.start();
    return () => { breatheLoop.stop(); tagLoop.stop(); };
  }, [enter, breathe, tag]);

  // Logo: pop in (scale + fade), then float + breathe forever.
  const logoStyle = {
    opacity: enter,
    transform: [
      { translateY: breathe.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -10, 0] }) },
      { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
      { scale: breathe.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.04, 1] }) },
    ],
  };
  // Tagline: subtle shimmer (opacity) + tiny drift, forever.
  const taglineStyle = {
    opacity: tag.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.62, 1, 0.62] }),
    transform: [{ translateY: tag.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -3, 0] }) }],
  };

  return (
    <View style={styles.root}>
      <LavaLamp />
      {/* Scrim keeps the wordmark + buttons legible over bright blobs. */}
      <View style={styles.scrim} pointerEvents="none" />
      <View style={[styles.content, { paddingTop: top + SPACE.LG }]}>
        <View style={styles.hero}>
          <View style={styles.wordmarkBox}>
            {/* Skia glow: a blurred dark copy of the wordmark behind it (traces the
                letters, no clipped text-shadow). */}
            {syne && wm.w > 0 && (() => {
              // Skia text (no negative letter-spacing) is wider than the RN wordmark —
              // size the canvas to it and center, so the last letters aren't clipped.
              const skiaW = syne.measureText('VIDRIP').width;
              const glowW = Math.max(wm.w, skiaW) + WM_PAD * 2;
              const glowH = wm.h + WM_PAD * 2;
              return (
                <Canvas
                  pointerEvents="none"
                  style={[styles.wordmarkGlow, { width: glowW, height: glowH, left: (wm.w - glowW) / 2 }]}>
                  <SkiaText x={(glowW - skiaW) / 2} y={WM_PAD + wm.h * 0.76} text="VIDRIP" font={syne}>
                    <Blur blur={11} />
                    <ColorMatrix matrix={WORDMARK_SHADOW_MATRIX} />
                  </SkiaText>
                </Canvas>
              );
            })()}
            <Text
              style={styles.wordmark}
              onLayout={e => {
                const { width, height } = e.nativeEvent.layout;
                setWm(s => (Math.abs(s.w - width) > 1 || Math.abs(s.h - height) > 1 ? { w: width, h: height } : s));
              }}>
              <Text style={styles.titleVi}>Vi</Text>
              {'drip '.split('').map((ch, i) => (
                <Text key={i} style={DRIP_COLORS[i]}>{ch}</Text>
              ))}
            </Text>
          </View>
          <View style={styles.logoBox}>
            {/* Shape-tracing glow: a blurred dark copy of the logo behind it (no boxy
                edges). Shares the float/breathe transform so it tracks the logo. */}
            <Animated.View style={[styles.logoGlow, logoStyle]} pointerEvents="none">
              <Canvas style={styles.logoGlowCanvas}>
                {logoImg && (
                  <SkImage image={logoImg} x={GLOW_PAD} y={GLOW_PAD + 6} width={LOGO} height={LOGO} fit="contain">
                    <Blur blur={16} />
                    <ColorMatrix matrix={SHADOW_MATRIX} />
                  </SkImage>
                )}
              </Canvas>
            </Animated.View>
            <Animated.Image source={logo} style={[styles.logo, logoStyle]} resizeMode="contain" />
          </View>
        </View>
        <GradientButton
          label="Enter Invitation Code"
          onPress={() => navigation.navigate('EnterInviteCode')}
          style={styles.button}
        />
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
  wordmarkBox: { alignItems: 'center', justifyContent: 'center' },
  wordmarkGlow: { position: 'absolute', top: -WM_PAD, left: -WM_PAD },
  wordmark: {
    fontSize: 52,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.WHITE,
    letterSpacing: -1.5,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  titleVi: { color: C.WHITE },
  logoBox: { width: LOGO, height: LOGO, alignItems: 'center', justifyContent: 'center', marginTop: 30 },
  logoGlow: { position: 'absolute', width: GLOW, height: GLOW, top: -GLOW_PAD, left: -GLOW_PAD },
  logoGlowCanvas: { width: GLOW, height: GLOW },
  logo: {
    width: LOGO,
    height: LOGO,
  },
  button: {
    borderRadius: RADIUS.MD,
    overflow: 'hidden',
    marginBottom: SPACE.MD,
    marginTop: -30,
    width: '90%',
    alignSelf: 'center',
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
