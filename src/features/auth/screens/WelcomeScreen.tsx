import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Text, useWindowDimensions } from 'react-native';
import {
  Canvas, Fill, Group, Circle, vec, Blur, ColorMatrix, Paint,
  LinearGradient as SkiaGradient, useClock,
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
    </Canvas>
  );
}

export default function WelcomeScreen({ navigation }: AuthStackScreenProps<'Welcome'>) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <LavaLamp />
      {/* Scrim keeps the wordmark + buttons legible over bright blobs. */}
      <View style={styles.scrim} pointerEvents="none" />
      <View style={[styles.content, { paddingTop: top + SPACE.LG }]}>
        <View style={styles.hero}>
          <Text style={styles.wordmark}>
            <Text style={styles.titleVi}>Vi</Text>
            {'drip '.split('').map((ch, i) => (
              <Text key={i} style={DRIP_COLORS[i]}>{ch}</Text>
            ))}
          </Text>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.tagline}>Share videos with friends &{'\n'}get reactions that matter.</Text>
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
  wordmark: {
    fontSize: 52,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.WHITE,
    letterSpacing: -1.5,
    fontWeight: '900',
    textTransform: 'uppercase',
    // Dark halo so the wordmark pops off the same-hue lava behind it.
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 16,
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
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
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
