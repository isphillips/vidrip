import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useDerivedValue, withRepeat, withTiming, withDelay,
  Easing, interpolate, Extrapolation, runOnJS, type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { FONT } from '../../theme';
import {
  W, H, BLUE, BRAND, HeroDrippy, HERO_W_DEFAULT, SceneBackdrop, TEXT_GLOW,
} from '../scene/sceneKit';

// Flowing "drip" wordmark — same treatment as the app header (FeedHomeScreen): a pink↔purple
// gradient slides under a "DRIP" text mask while "VI" stays solid white.
const FLOW_PINK = '#FF4FA3';
const FLOW_PURPLE = '#A05CFF';
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// ════════════════════════════════════════════════════════════════════════════════════════════
//  Vidrip launch scene — the animated curtain-raiser the app shows while it boots.
//
//  The iOS LaunchScreen.storyboard is a STATIC OS snapshot (it can't animate), so this is where the
//  world comes alive. It renders the shared <SceneBackdrop> (the dusk slime-land + Drippy's crew,
//  see sceneKit) and overlays the hero Drippy, the wordmark, and a gooey "slime-trail" loading bar
//  with a tiny rider slime pushing the progress along. Reanimated UI-thread loops keep it buttery
//  even while the JS thread is busy initialising.
//
//  Lifecycle: mount → play an entrance + creep the loader to ~92% → when the app reports `ready`
//  (and a graceful minimum has elapsed) finish the bar to 100%, dissolve, and call `onHidden`.
// ════════════════════════════════════════════════════════════════════════════════════════════

const MIN_VISIBLE_MS = 2600; // let the scene breathe even on an instant cold boot
const HERO_W = HERO_W_DEFAULT;
const TRACK_W = Math.min(300, W - 96);
const TRACK_H = 16;

// ── The whimsical slime-trail loading bar ─────────────────────────────────────────────────────

// A bubble that rises and pops inside the goo.
function Bubble({ offset, delay }: { offset: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false));
  }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.2, 0.85, 1], [0, 0.85, 0.6, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(t.value, [0, 1], [TRACK_H * 0.5, -TRACK_H * 0.3]) }, { scale: 0.5 + t.value * 0.8 }],
  }));
  return <Animated.View style={[styles.bubble, { left: offset }, st]} pointerEvents="none" />;
}

function LoadingBar({ progress, enter }: { progress: SharedValue<number>; enter: SharedValue<number> }) {
  const ride = useSharedValue(0);
  const shimmer = useSharedValue(0);
  useEffect(() => {
    ride.value = withRepeat(withTiming(1, { duration: 720, easing: Easing.inOut(Easing.quad) }), -1, true);
    shimmer.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [ride, shimmer]);

  const fillStyle = useAnimatedStyle(() => ({ width: interpolate(progress.value, [0, 1], [TRACK_H, TRACK_W], Extrapolation.CLAMP) }));
  const headStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, TRACK_W - TRACK_H], Extrapolation.CLAMP) }],
  }));
  const riderStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [-2, TRACK_W - 22], Extrapolation.CLAMP) },
      { translateY: interpolate(ride.value, [0, 1], [0, -3]) },
      { rotate: `${interpolate(ride.value, [0, 1], [-4, 4])}deg` },
    ],
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-40, TRACK_W + 40]) }, { rotate: '18deg' }],
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0, 0.5, 0]),
  }));
  const dripStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: interpolate(ride.value, [0, 1], [0.8, 1.25]) }],
    opacity: interpolate(progress.value, [0, 0.05, 1], [0, 1, 1]),
  }));
  const wrapStyle = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateY: interpolate(enter.value, [0, 1], [16, 0]) }] }));
  const pct = useDerivedValue(() => Math.round(Math.min(1, progress.value) * 100));
  const [pctText, setPctText] = useState(0);
  useDerivedValue(() => { runOnJS(setPctText)(pct.value); });

  return (
    <Animated.View style={[styles.barWrap, wrapStyle]}>
      {/* the rider slime, pushing the goo along */}
      <Animated.View style={[styles.rider, riderStyle]} pointerEvents="none">
        <View style={styles.riderBody}>
          <View style={[styles.riderEye, { left: 5 }]} />
          <View style={[styles.riderEye, { right: 5 }]} />
        </View>
      </Animated.View>

      <View style={styles.track}>
        {/* the gooey fill */}
        <Animated.View style={[styles.fillClip, fillStyle]}>
          <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: TRACK_W }]} />
          <Bubble offset={TRACK_W * 0.2} delay={0} />
          <Bubble offset={TRACK_W * 0.5} delay={500} />
          <Bubble offset={TRACK_W * 0.78} delay={950} />
          <Animated.View style={[styles.shimmer, shimmerStyle]} />
        </Animated.View>
        {/* glossy goo head + a hanging drip at the leading edge */}
        <Animated.View style={[styles.head, headStyle]} pointerEvents="none">
          <View style={styles.headBulb} />
          <Animated.View style={[styles.drip, dripStyle]} />
        </Animated.View>
      </View>

      <Text style={styles.pct}>{pctText}%</Text>
    </Animated.View>
  );
}

// ── Orchestrator ──────────────────────────────────────────────────────────────────────────────

const MESSAGES = [
  'Waking the slimes…',
  'Polishing the goo…',
  'Inflating reaction balloons…',
  'Rounding up the crew…',
  'Tuning Drippy’s wobble…',
  'Almost squishy-ready…',
];

export default function SplashScene({ ready, onHidden }: { ready: boolean; onHidden: () => void }) {
  const insets = useSafeAreaInsets();
  const mountAt = useRef(Date.now()).current;
  const [finishing, setFinishing] = useState(false);
  const [msg, setMsg] = useState(0);

  // The dissolve must run EXACTLY once. The fade effect below depends on `onHidden`, and a parent
  // re-render (many fire as session/onboarding/MFA state settles right after launch) would otherwise
  // re-run it and restart the opacity fade — pinning the splash at partial opacity so its slime-land
  // hills bleed over the freshly-mounted app. This latch is set when the fade actually begins.
  const finishedRef = useRef(false);

  const opacity = useSharedValue(1);
  const progress = useSharedValue(0);
  const enter = useSharedValue(0);
  const wordmark = useSharedValue(0);
  const flow = useSharedValue(0);
  const [dripSize, setDripSize] = useState({ w: 130, h: 64 });

  useEffect(() => {
    enter.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    wordmark.value = withDelay(220, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
    progress.value = withTiming(0.92, { duration: 2400, easing: Easing.out(Easing.cubic) });
    // flowing-gradient loop for the DRIP mask (matches the header's 3.2s linear flow)
    flow.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.linear }), -1, false);
  }, [enter, wordmark, progress, flow]);

  useEffect(() => {
    const id = setInterval(() => setMsg(m => (m + 1) % MESSAGES.length), 1100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!ready || finishedRef.current) { return; }
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - mountAt));
    let failsafe: ReturnType<typeof setTimeout>;
    const id = setTimeout(() => {
      // Latch only when the dissolve truly starts, so a re-run that clears this timeout BEFORE it
      // fires can still reschedule — but once the fade is underway, nothing can restart it.
      if (finishedRef.current) { return; }
      finishedRef.current = true;
      setFinishing(true);
      progress.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
      opacity.value = withDelay(360, withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) }, (fin) => {
        if (fin) { runOnJS(onHidden)(); }
      }));
      // Failsafe: tear down even if Reanimated drops the completion callback (e.g. the animation
      // is interrupted), so the launch scene can NEVER linger over the app. Idempotent with onHidden.
      failsafe = setTimeout(onHidden, 360 + 520 + 250);
    }, wait);
    return () => { clearTimeout(id); clearTimeout(failsafe); };
  }, [ready, mountAt, progress, opacity, onHidden]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [{ translateY: interpolate(wordmark.value, [0, 1], [18, 0]) }],
  }));
  const dripFlow = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(flow.value, [0, 1], [0, -dripSize.w]) }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, containerStyle]} pointerEvents={finishing ? 'none' : 'auto'}>
      {/* the shared dusk slime-land */}
      <SceneBackdrop enter={enter} />

      {/* Hero Drippy, centre stage */}
      <View style={styles.heroWrap}><HeroDrippy enter={enter} width={HERO_W} /></View>

      {/* wordmark — "VI" solid + a flowing-gradient "DRIP", same as the app header */}
      <Animated.View style={[styles.titleWrap, wordmarkStyle]} pointerEvents="none">
        <View style={styles.wordRow}>
          <Text style={[styles.wordmark, styles.wordVi]}>VI</Text>
          <MaskedView
            style={{ width: dripSize.w, height: dripSize.h }}
            maskElement={
              <Text
                style={styles.wordmark}
                onLayout={e => {
                  const { width, height } = e.nativeEvent.layout;
                  setDripSize(s => (Math.abs(s.w - width) > 1 || Math.abs(s.h - height) > 1) ? { w: width, h: height } : s);
                }}>
                DRIP
              </Text>
            }>
            <AnimatedLinearGradient
              colors={[FLOW_PINK, FLOW_PURPLE, FLOW_PINK, FLOW_PURPLE, FLOW_PINK]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[{ width: dripSize.w * 2, height: dripSize.h }, dripFlow]}
            />
          </MaskedView>
        </View>
      </Animated.View>

      {/* the slime-trail loader */}
      <View style={[styles.loaderDock, { bottom: insets.bottom + 44 }]}>
        <Text style={styles.loadMsg}>{MESSAGES[msg]}</Text>
        <LoadingBar progress={progress} enter={enter} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heroWrap: { position: 'absolute', left: 0, right: 0, top: H * 0.34, alignItems: 'center' },

  // title
  titleWrap: { position: 'absolute', left: 0, right: 0, top: H * 0.16, alignItems: 'center' },
  wordRow: { flexDirection: 'row', alignItems: 'flex-end' },
  // base glyph style (no shadow → clean alpha for the DRIP mask); VI adds the glow on top.
  wordmark: { fontSize: 46, fontFamily: FONT.DISPLAY_BOLD, fontWeight: '700', color: '#fff', letterSpacing: -1 },
  wordVi: { ...TEXT_GLOW, textShadowRadius: 16 },
  tagline: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: 'rgba(245,235,250,0.95)', letterSpacing: 1.5, marginTop: 4, textTransform: 'lowercase', ...TEXT_GLOW },

  // loader
  loaderDock: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  loadMsg: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: 'rgba(245,240,238,0.95)', marginBottom: 14, letterSpacing: 0.3, ...TEXT_GLOW },
  barWrap: { width: TRACK_W, alignItems: 'center' },
  rider: { position: 'absolute', top: -16, left: 0, zIndex: 3 },
  riderBody: { width: 22, height: 22, borderTopLeftRadius: 11, borderTopRightRadius: 11, borderBottomLeftRadius: 7, borderBottomRightRadius: 9, backgroundColor: '#fff', alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  riderEye: { position: 'absolute', top: 7, width: 4, height: 4, borderRadius: 2, backgroundColor: '#1a0b22' },
  track: {
    width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, backgroundColor: 'rgba(10,4,20,0.55)',
    borderWidth: 1, borderColor: 'rgba(224,86,253,0.25)', overflow: 'visible', justifyContent: 'center',
  },
  fillClip: { height: TRACK_H, borderRadius: TRACK_H / 2, overflow: 'hidden', position: 'absolute', left: 0 },
  fill: { height: TRACK_H },
  bubble: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)' },
  shimmer: { position: 'absolute', top: -6, width: 18, height: TRACK_H + 12, backgroundColor: 'rgba(255,255,255,0.55)' },
  head: { position: 'absolute', left: 0, top: 0, width: TRACK_H, height: TRACK_H, alignItems: 'center', justifyContent: 'center' },
  headBulb: { width: TRACK_H + 2, height: TRACK_H + 2, borderRadius: (TRACK_H + 2) / 2, backgroundColor: '#fff', opacity: 0.9 },
  drip: { position: 'absolute', top: TRACK_H * 0.6, width: 6, height: 10, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: BLUE },
  pct: { marginTop: 12, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_BOLD, color: 'rgba(234,201,238,0.85)', letterSpacing: 1, ...TEXT_GLOW },
});
