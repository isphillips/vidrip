import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Linking, Alert, ScrollView, TouchableOpacity,
} from 'react-native';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSpring, withDelay, interpolate, Extrapolation, Easing, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { useOAuthStore } from '../../store/oauthStore';
import { buildAuthUrl } from '../../infrastructure/oauth/config';
import { syncOAuthCode } from '../../infrastructure/supabase/queries/syncedAccounts';
import { refreshConnectedFeed } from '../../infrastructure/supabase/queries/connectedFeed';
import LinearGradient from 'react-native-linear-gradient';
import { DecoDivider, Kicker, Pips, DecoButton } from './components';
import PaintReveal from '../../components/PaintReveal';
import { SceneBackdrop, CopyScrim, TEXT_GLOW, W } from '../../components/scene/sceneKit';
import GradientButton from '../studio/components/GradientButton';
import OnboardingSlime from './OnboardingSlime';

const STEPS = 5;

// Per-letter pink→purple ramp across the 6 letters of VIDRIP (stable objects).
const VIDRIP_COLORS = [
  { color: '#E73D93' }, { color: '#D93D9F' }, { color: '#CB3EAB' },
  { color: '#BC3EB8' }, { color: '#AE3FC4' }, { color: '#A03FD0' },
];

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export default function OnboardingScreen({ onDone }: { mode: 'firstRun' | 'replay'; onDone: () => void }) {
  const { top, bottom } = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const handle = profile?.handle ? `@${profile.handle}` : 'a friend';

  const [step, setStep] = useState(0);
  const next = () => setStep(s => Math.min(s + 1, STEPS - 1));
  const back = () => setStep(s => Math.max(0, s - 1));

  // The slime-land scene lives behind every step (one continuous fantasy world, shared with the
  // launch splash + the creator intro). It eases in on mount and fades out with `cover` on the
  // final step so the paint-reveal finale reads cleanly.
  const sceneEnter = useSharedValue(0);
  useEffect(() => {
    sceneEnter.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [sceneEnter]);

  // Plain black backdrop until the final step, where the curtain stage is unveiled
  // (black fades out) and the back curtain then raises to reveal the room.
  const cover = useSharedValue(step === STEPS - 1 ? 0 : 1);
  // Heavy gradient scrim behind the final-step copy — fades/grows in as the paint reveals
  // so the white text stays legible over the splatter.
  const scrim = useSharedValue(step === STEPS - 1 ? 1 : 0);
  const [reveal, setReveal] = useState(step === STEPS - 1);
  useEffect(() => {
    const last = step === STEPS - 1;
    cover.value = withTiming(last ? 0 : 1, { duration: 600, easing: Easing.inOut(Easing.ease) });
    scrim.value = withTiming(last ? 1 : 0, { duration: 600, easing: Easing.inOut(Easing.ease) });
    if (last) {
      const id = setTimeout(() => setReveal(true), 600);
      return () => clearTimeout(id);
    }
    setReveal(false);
  }, [step, cover, scrim]);
  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: scrim.value,
    transform: [{ scaleY: interpolate(scrim.value, [0, 1], [0.82, 1], Extrapolation.CLAMP) }],
  }));

  // ── For You connect (feed OAuth) ────────────────────────────────────────────
  const { pending, clearPending } = useOAuthStore();
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!pending) { return; }
    const { provider, connectionType, code, error } = pending;
    clearPending();
    if (error || !code) {
      setConnecting(false);
      if (error) { Alert.alert("Couldn't connect", error); }
      return;
    }
    setConnecting(true);
    syncOAuthCode(provider, code, connectionType)
      .then(async () => {
        if (connectionType === 'feed') { await refreshConnectedFeed(provider).catch(() => {}); }
        setConnected(true);
      })
      .catch((e: any) => Alert.alert('Sync failed', e?.message ?? 'Could not connect account.'))
      .finally(() => setConnecting(false));
  }, [pending, clearPending]);

  const connectYouTube = () => {
    setConnecting(true);
    Linking.openURL(buildAuthUrl('youtube', 'feed').url).catch(() => {
      setConnecting(false);
      Alert.alert('Error', 'Could not open the login page.');
    });
  };

  return (
    <View style={[styles.stage, { paddingTop: top }]}>
      {/* The shared slime-land backdrop; fades out on the final step to reveal the paint stage. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, coverStyle]}>
        <SceneBackdrop enter={sceneEnter} />
      </Animated.View>
      {/* Paint splatter + dripping reveal, replacing the curtain on the last step. */}
      <PaintReveal active={reveal} />
      {/* Heavy vertical gradient band behind the final-step copy (above the paint, below the text). */}
      {step === STEPS - 1 && (
        <AnimatedLinearGradient
          pointerEvents="none"
          colors={['rgba(11,5,24,0)', 'rgba(11,5,24,0.75)', 'rgba(11,5,24,0.77)', 'rgba(11,5,24,0.73)', 'rgba(11,5,24,0)']}
          locations={[0, 0.16, 0.5, 0.84, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.copyScrim, scrimStyle]}
        />
      )}
      {step > 0 && (
        <TouchableOpacity style={[styles.backBtn, { top: top + SPACE.SM }]} onPress={back} hitSlop={12}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
      )}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View key={step} entering={FadeIn.duration(350)} style={styles.stepWrap}>
          {step === 0 && (
            <View style={styles.center}>
              <OnboardingSlime mood="welcome" />
              <Kicker>Friends Only</Kicker>
              <Text style={styles.h1}>
                Welcome to{'\n'}
                {'VIDRIP'.split('').map((ch, i) => (
                  <Text key={i} style={[styles.vidrip, VIDRIP_COLORS[i]]}>{ch}</Text>
                ))}
              </Text>
              <DecoDivider />
              <View style={styles.desc}>
                <CopyScrim style={styles.descScrim} />
                <Text style={styles.body}>
                  You're in the drip. This is where you and your friends trade clips and react to each other. Nobody else, just your circle. Drippy will show you the ropes.
                </Text>
                <Text style={styles.whisper}>Tell your crew {handle} sent 'em.</Text>
              </View>
            </View>
          )}

          {step === 1 && (
            <View style={styles.center}>
              <OnboardingSlime mood="liked" />
              <Kicker>Step One</Kicker>
              <Text style={styles.h2}>Your “Liked”</Text>
              <DecoDivider />
              <ForYouMock />
              <View style={styles.desc}>
                <CopyScrim style={styles.descScrim} />
                <Text style={styles.body}>
                  Pull in your YouTube <Text style={styles.em}>Liked videos</Text>. They pool into your private{' '}
                  <Text style={styles.em}>Liked</Text> stash, so there's always something good to drip to a friend.
                </Text>
                {connected ? (
                  <View style={styles.connectedRow}>
                    <Text style={styles.connectedText}>YouTube connected ✓</Text>
                  </View>
                ) : (
                  <Text style={styles.whisper}>You can do this later in your account.</Text>
                )}
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.center}>
              <OnboardingSlime mood="share" />
              <Kicker>Step Two</Kicker>
              <Text style={styles.h2}>Share a clip</Text>
              <DecoDivider />
              <ShareMock />
            </View>
          )}

          {step === 3 && (
            <View style={styles.center}>
              <OnboardingSlime mood="react" />
              <Kicker>Step Three</Kicker>
              <Text style={styles.h2}>React back</Text>
              <DecoDivider />
              <ReactMock />
            </View>
          )}

          {step === 4 && (
            <View style={styles.center}>
              <OnboardingSlime mood="done" />
              <Kicker>You're set</Kicker>
              <Pop delay={220} scaleFrom={0.45}>
                <Text style={styles.h2Epic}>Let it drip</Text>
              </Pop>
              <DecoDivider />
              <Pop delay={420}>
                <Text style={[styles.body, { color: C.WHITE }]}>
                  That's the whole drop. Share what you love. React to what they send.
                </Text>
              </Pop>
              <Pop delay={580}>
                <Text style={styles.whisper}>Welcome to the club.</Text>
              </Pop>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Footer: pips + CTAs */}
      <View style={[styles.footer, { paddingBottom: bottom + SPACE.LG }]}>
        <Pips count={STEPS} active={step} />
        <View style={styles.ctaCol}>
          {step === 0 && <GradientButton label="DRIP IN" icon="sparkles" onPress={next} />}

          {step === 1 && (
            connected
              ? <GradientButton label="NEXT" icon="arrow-forward" onPress={next} />
              : <>
                  <GradientButton label="CONNECT YOUTUBE" icon="logo-youtube" loading={connecting} onPress={connectYouTube} />
                  <DecoButton label="Skip for now" variant="ghost" onPress={next} />
                </>
          )}

          {(step === 2 || step === 3) && <GradientButton label="NEXT" icon="arrow-forward" onPress={next} />}

          {step === 4 && <GradientButton label="LET ME IN" icon="sparkles" onPress={onDone} />}
        </View>
      </View>
    </View>
  );
}

// ── Animated how-to demos (loop forever) ───────────────────────────────────────
const CLAMP = Extrapolation.CLAMP;

// Spring "pop": scales up past 1 then settles, with a rise + fade. Used to punch the
// final-step words in over the paint reveal (staggered by `delay`).
function Pop({ delay = 0, scaleFrom = 0.7, children }: { delay?: number; scaleFrom?: number; children: React.ReactNode }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withSpring(1, { damping: 8, stiffness: 150, mass: 0.7 }));
  }, [v, delay]);
  const a = useAnimatedStyle(() => ({
    opacity: interpolate(v.value, [0, 0.55], [0, 1], CLAMP),
    transform: [
      { scale: interpolate(v.value, [0, 1], [scaleFrom, 1]) },     // spring overshoot → a little pop past 1
      { translateY: interpolate(v.value, [0, 1], [16, 0], CLAMP) },
    ],
  }));
  return <Animated.View style={[styles.popWrap, a]}>{children}</Animated.View>;
}

// One thumbnail that pops into the For You grid at its turn.
function GridTile({ p, start }: { p: SharedValue<number>; start: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [start, start + 0.08], [0, 1], CLAMP),
    transform: [{ scale: interpolate(p.value, [start, start + 0.1], [0.3, 1], CLAMP) }],
  }));
  return (
    <Animated.View style={[styles.fyTile, style]}>
      <Text style={styles.fyTileGlyph}>▶</Text>
    </Animated.View>
  );
}

// For You: a liked clip → its videos fill a private grid. Loops.
function ForYouMock() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, [p]);

  const play = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.05, 0.3], [0.5, 1, 0.6], CLAMP),
  }));
  const heart = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.05, 0.85, 0.95], [0, 1, 1, 0], CLAMP),
    transform: [{ scale: interpolate(p.value, [0.05, 0.14, 0.24], [0.5, 1.35, 1], CLAMP) }],
  }));
  const arrow = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.3, 0.4, 0.86, 0.94], [0, 1, 1, 0.2], CLAMP),
    transform: [
      { translateX: interpolate(p.value, [0.3, 0.42], [-12, 0], CLAMP) },
      { scale: interpolate(p.value, [0.3, 0.42], [0.5, 1], CLAMP) },
    ],
  }));

  return (
    <View style={styles.demo}>
      <View style={styles.demoCard}>
        <View style={styles.demoThumb}>
          <Animated.Text style={[styles.demoPlay, play]}>▶</Animated.Text>
        </View>
        <Animated.Text style={[styles.fyHeart, heart]}>♥</Animated.Text>
      </View>
      <Animated.Text style={[styles.demoArrow, styles.fyArrow, arrow]}>➜</Animated.Text>
      <View style={styles.fyGrid}>
        <GridTile p={p} start={0.42} />
        <GridTile p={p} start={0.52} />
        <GridTile p={p} start={0.62} />
        <GridTile p={p} start={0.72} />
      </View>
    </View>
  );
}

// Share: clip plays → a copy flies to a friend → "Sent ✓". Loops.
function ShareMock() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, [p]);

  const progress = useAnimatedStyle(() => ({
    width: `${interpolate(p.value, [0, 0.32, 0.9, 1], [4, 100, 100, 4], CLAMP)}%`,
  }));
  const play = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.04, 0.3, 0.38], [0.5, 1, 1, 0], CLAMP),
  }));
  const packet = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.36, 0.42, 0.6, 0.66], [0, 1, 1, 0], CLAMP),
    transform: [
      { translateX: interpolate(p.value, [0.4, 0.64], [0, 132], CLAMP) },
      { translateY: interpolate(p.value, [0.4, 0.52, 0.64], [0, -22, 0], CLAMP) },
      { scale: interpolate(p.value, [0.4, 0.64], [1, 0.45], CLAMP) },
    ],
  }));
  const friend = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(p.value, [0.58, 0.68, 0.8], [1, 1.28, 1], CLAMP) }],
  }));
  const sent = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.66, 0.74, 0.92, 1], [0, 1, 1, 0], CLAMP),
  }));
  const arrow = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.3, 0.42, 0.66, 0.74], [0.2, 1, 1, 0.2], CLAMP),
  }));

  return (
    <View style={styles.demoWrap}>
      <View style={styles.demo}>
        <View style={styles.demoCard}>
          <View style={styles.demoThumb}>
            <Animated.Text style={[styles.demoPlay, play]}>▶</Animated.Text>
            <View style={styles.progressTrack}><Animated.View style={[styles.progressFill, progress]} /></View>
          </View>
        </View>
        <Animated.Text style={[styles.demoArrow, arrow]}>➜</Animated.Text>
        <Animated.View style={[styles.packet, packet]} />
        <View style={styles.demoFriend}>
          <Animated.View style={[styles.demoAvatar, friend]}><Text style={styles.demoAvatarText}>A</Text></Animated.View>
          <Animated.Text style={[styles.demoSent, sent]}>Sent ✓</Animated.Text>
        </View>
      </View>
      <View style={styles.desc}>
        <CopyScrim style={styles.descScrim} />
        <View style={styles.dSteps}>
          <DemoStep p={p} index={1} range={[0, 0.34]} label="Browse or paste a clip" />
          <DemoStep p={p} index={2} range={[0.34, 0.6]} label="Pick a friend" />
          <DemoStep p={p} index={3} range={[0.6, 0.97]} label="Drip it over" />
        </View>
      </View>
    </View>
  );
}

// React: clip plays → record (blinking dot) → reaction face + emojis pop. Loops.
function ReactMock() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 4600, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, [p]);

  // The preview starts centered, then slides to the left.
  const CENTER = 70; // (demo 264 - card 124) / 2
  const card = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(p.value, [0, 0.2, 0.42, 1], [CENTER, CENTER, 0, 0], CLAMP) }],
  }));
  const play = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.05, 0.16, 0.22], [0.5, 1, 1, 0.3], CLAMP),
  }));
  const recBtn = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(p.value, [0.05, 0.13, 0.22], [1, 1.12, 1], CLAMP) }],
  }));
  // Blinking record dot while "recording" (during the centered phase).
  const recDot = useAnimatedStyle(() => {
    const on = p.value > 0.05 && p.value < 0.4;
    return { opacity: on ? (Math.sin(p.value * Math.PI * 22) > 0 ? 1 : 0.2) : 0 };
  });
  // Arrow emerges from the card as it slides left (hidden until then).
  const arrow = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.34, 0.46, 0.78, 0.86], [0, 1, 1, 0.2], CLAMP),
    transform: [
      { translateX: interpolate(p.value, [0.34, 0.48], [-16, 0], CLAMP) },
      { scale: interpolate(p.value, [0.34, 0.48], [0.5, 1], CLAMP) },
    ],
  }));
  const face = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.5, 0.62], [0, 1], CLAMP),
    transform: [{ scale: interpolate(p.value, [0.5, 0.66, 0.76], [0.4, 1.1, 1], CLAMP) }],
  }));
  const emojis = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.66, 0.74, 0.94, 1], [0, 1, 1, 0], CLAMP),
    transform: [
      { translateY: interpolate(p.value, [0.66, 0.82], [6, -10], CLAMP) },
      { scale: interpolate(p.value, [0.66, 0.76], [0.5, 1], CLAMP) },
    ],
  }));

  return (
    <View style={styles.demoWrap}>
      <View style={styles.demo}>
        <Animated.View style={[styles.demoCard, card]}>
          <View style={styles.demoThumb}>
            <Animated.Text style={[styles.demoPlay, play]}>▶</Animated.Text>
          </View>
          <Animated.View style={[styles.recBtn, recBtn]}>
            <Animated.View style={[styles.recDot, recDot]} />
            <Text style={styles.recText}>Record</Text>
          </Animated.View>
        </Animated.View>
        <Animated.Text style={[styles.demoArrow, arrow]}>➜</Animated.Text>
        <View style={styles.demoFriend}>
          <Animated.View style={[styles.demoFace, face]}><Text style={styles.demoFaceGlyph}>☺</Text></Animated.View>
          <Animated.Text style={[styles.demoEmojis, emojis]}>😂 🔥</Animated.Text>
        </View>
      </View>
      <View style={styles.desc}>
        <CopyScrim style={styles.descScrim} />
        <View style={styles.dSteps}>
          <DemoStep p={p} index={1} range={[0, 0.2]} label="Open a clip a friend sent" />
          <DemoStep p={p} index={2} range={[0.2, 0.5]} label="Tap “Record Your Reaction”" />
          <DemoStep p={p} index={3} range={[0.5, 0.98]} label="They watch you watch it" />
        </View>
      </View>
    </View>
  );
}

// One numbered step that highlights while its phase is active in the demo loop.
function DemoStep({ p, index, range, label }: { p: SharedValue<number>; index: number; range: [number, number]; label: string }) {
  const rowStyle = useAnimatedStyle(() => {
    const on = p.value >= range[0] && p.value <= range[1];
    return { opacity: withTiming(on ? 1 : 0.4), transform: [{ scale: withTiming(on ? 1.05 : 1) }] };
  });
  const numStyle = useAnimatedStyle(() => ({
    backgroundColor: (p.value >= range[0] && p.value <= range[1]) ? C.GOLD : 'transparent',
  }));
  const numTextStyle = useAnimatedStyle(() => ({
    color: (p.value >= range[0] && p.value <= range[1]) ? C.BG_SOLID : C.GOLD,
  }));
  return (
    <Animated.View style={[styles.dStepLine, rowStyle]}>
      <Animated.View style={[styles.dStepNum, numStyle]}>
        <Animated.Text style={[styles.dStepNumText, numTextStyle]}>{index}</Animated.Text>
      </Animated.View>
      <Text style={styles.dStepText}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  // Onboarding stage — sits over the app gradient (ScreenGradient wrap).
  stage: { flex: 1 },
  // Curtain photo backdrop (final step)
  curtains: { ...StyleSheet.absoluteFillObject, marginLeft: -35 },
  curtainImg: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  curtainScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,10,9,0.35)' },

  backBtn: { position: 'absolute', left: SPACE.LG, zIndex: 10, paddingVertical: SPACE.XS, paddingRight: SPACE.MD },
  backText: { color: C.MUTED, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.MD },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: SPACE.XL },
  stepWrap: { flex: 1, justifyContent: 'center' },
  center: { alignItems: 'center', gap: SPACE.MD },
  // Each step's description sits in a screen-wide carrier so its dark scrim spans edge to
  // edge while the copy keeps its normal side padding. `W` (full screen width) centered in
  // the already-centered content makes the band full-bleed; the scrim feathers top/bottom
  // so it darkens the description without touching Drippy or the glowing heading above.
  desc: { width: W, alignItems: 'center', paddingHorizontal: SPACE.XL, paddingVertical: SPACE.XXL, gap: SPACE.MD },
  descScrim: { top: -SPACE.SM, bottom: -SPACE.SM },

  h1: { fontSize: FONT.SIZES.XXXL, fontFamily: FONT.DISPLAY_BOLD, fontWeight: FONT.WEIGHTS.MEDIUM, color: C.INK, textAlign: 'center', textTransform: 'uppercase', ...TEXT_GLOW },
  vidrip: { fontFamily: 'Syne-ExtraBold', fontWeight: FONT.WEIGHTS.BOLD, letterSpacing: 0.5 },
  h2: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD, fontWeight: FONT.WEIGHTS.BOLD, color: C.INK, textAlign: 'center', textTransform: 'uppercase', ...TEXT_GLOW },
  // Final-step payoff title — bigger, with a pink neon glow so it pops off the paint.
  h2Epic: {
    fontSize: FONT.SIZES.XXXL, fontFamily: FONT.DISPLAY_BOLD, fontWeight: FONT.WEIGHTS.BOLD,
    color: C.WHITE, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1,
    textShadowColor: 'rgba(231,61,147,0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20,
  },
  popWrap: { alignSelf: 'stretch', alignItems: 'center' },
  // Vertical gradient band behind the final-step copy — feathered top/bottom (no hard clip), heavy center.
  copyScrim: { position: 'absolute', left: 0, right: 0, top: '18%', height: '62%' },
  body: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.INK, textAlign: 'center', lineHeight: 24, maxWidth: 320, ...TEXT_GLOW },
  em: { color: C.GOLD, fontFamily: FONT.BODY_SEMIBOLD },
  whisper: { fontSize: FONT.SIZES.MD, fontFamily: FONT.DISPLAY_ITALIC, fontStyle: 'italic', color: C.GOLD, textAlign: 'center', marginTop: SPACE.SM, ...TEXT_GLOW },

  connectedRow: { marginTop: SPACE.SM, borderWidth: 1, borderColor: C.GOLD, borderRadius: RADIUS.FULL, paddingHorizontal: SPACE.LG, paddingVertical: SPACE.XS },
  connectedText: { color: C.GOLD, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },

  footer: { paddingHorizontal: SPACE.XL, paddingTop: SPACE.LG, gap: SPACE.LG },
  ctaCol: { gap: SPACE.SM },

  // animated how-to demos
  demoWrap: { alignItems: 'center', gap: SPACE.SM },
  demo: { width: 264, height: 96, alignSelf: 'center', marginVertical: SPACE.MD },
  demoArrow: { position: 'absolute', left: 158, top: 28, color: C.GOLD, fontSize: 24, fontFamily: FONT.BODY_BOLD },
  demoCard: { position: 'absolute', left: 0, top: 8, width: 124, backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, padding: SPACE.SM, gap: SPACE.XS },
  demoThumb: { height: 60, borderRadius: RADIUS.SM, backgroundColor: C.SURFACE_2, alignItems: 'center', justifyContent: 'center' },
  demoPlay: { color: C.GOLD, fontSize: 20 },
  progressTrack: { position: 'absolute', left: 6, right: 6, bottom: 6, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: C.GOLD },
  packet: { position: 'absolute', left: 96, top: 28, width: 30, height: 24, borderRadius: 4, backgroundColor: C.GOLD_DIM, borderWidth: 1, borderColor: C.GOLD },
  demoFriend: { position: 'absolute', right: 0, top: 14, width: 64, alignItems: 'center', gap: SPACE.XS },
  // For You demo: heart on the source clip + a grid the videos pop into.
  fyHeart: { position: 'absolute', top: 7, right: 8, color: C.ACCENT_HOT, fontSize: 22 },
  fyArrow: { left: 147, top: 32 },
  fyGrid: { position: 'absolute', right: 0, top: 18, width: 74, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  fyTile: { width: 34, height: 26, borderRadius: 4, backgroundColor: C.BLACK, borderWidth: 1, borderColor: C.GOLD_DIM, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fyTileGlyph: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  demoAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.ACCENT_LITE, borderWidth: 1, borderColor: C.ACCENT, alignItems: 'center', justifyContent: 'center' },
  demoAvatarText: { color: C.ACCENT_HOT, fontFamily: FONT.DISPLAY_BOLD, fontSize: FONT.SIZES.LG },
  demoSent: { color: C.GOLD, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.XS },
  recBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.ACCENT, borderRadius: RADIUS.SM, paddingVertical: 6 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.WHITE },
  recText: { color: C.WHITE, fontFamily: FONT.BODY_BOLD, fontSize: 11 },
  demoFace: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.SURFACE_2, borderWidth: 1, borderColor: C.GOLD_DIM, alignItems: 'center', justifyContent: 'center' },
  demoFaceGlyph: { color: C.GOLD, fontSize: 24 },
  demoEmojis: { fontSize: FONT.SIZES.MD },

  // animated numbered steps (highlight in sync with the demo)
  dSteps: { gap: SPACE.MD, marginTop: SPACE.SM, alignSelf: 'stretch', maxWidth: 320 },
  dStepLine: { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD },
  dStepNum: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.GOLD, alignItems: 'center', justifyContent: 'center' },
  dStepNumText: { color: C.GOLD, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.LG, marginTop: -2 },
  dStepText: { flex: 1, color: C.INK, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.LG },
});
