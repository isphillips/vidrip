import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Linking, Alert, ScrollView, TouchableOpacity,
} from 'react-native';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withTiming, withDelay, withRepeat, interpolate, Extrapolation, Easing, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { useOAuthStore } from '../../store/oauthStore';
import { buildAuthUrl } from '../../infrastructure/oauth/config';
import { syncOAuthCode } from '../../infrastructure/supabase/queries/syncedAccounts';
import { refreshConnectedFeed } from '../../infrastructure/supabase/queries/connectedFeed';
import { DecoDivider, Kicker, Pips, DecoButton } from './components';
import CurtainStage from '../../components/CurtainStage';

const STEPS = 5;
const LOGO_W = 96;
const LOGO_H = 104;

export default function OnboardingScreen({ onDone }: { mode: 'firstRun' | 'replay'; onDone: () => void }) {
  const { top, bottom } = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const handle = profile?.handle ? `@${profile.handle}` : 'a friend';

  const [step, setStep] = useState(0);
  const next = () => setStep(s => Math.min(s + 1, STEPS - 1));
  const back = () => setStep(s => Math.max(0, s - 1));

  // Plain black backdrop until the final step, where the curtain stage is unveiled
  // (black fades out) and the back curtain then raises to reveal the room.
  const cover = useSharedValue(step === STEPS - 1 ? 0 : 1);
  const [reveal, setReveal] = useState(step === STEPS - 1);
  useEffect(() => {
    const last = step === STEPS - 1;
    cover.value = withTiming(last ? 0 : 1, { duration: 600, easing: Easing.inOut(Easing.ease) });
    if (last) {
      const id = setTimeout(() => setReveal(true), 600);
      return () => clearTimeout(id);
    }
    setReveal(false);
  }, [step, cover]);
  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));

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

  // Wax-seal stamp entrance + a continuous 3D rock so the coin catches the light.
  const stamp = useSharedValue(0);
  const tilt = useSharedValue(0);
  const bob = useSharedValue(0);
  useEffect(() => {
    stamp.value = withDelay(120, withTiming(1, { duration: 600, easing: Easing.out(Easing.back(1.6)) }));
    tilt.value = withRepeat(withTiming(1, { duration: 3600, easing: Easing.linear }), -1, false);
    bob.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.linear }), -1, false);
  }, [stamp, tilt, bob]);
  const logoStyle = useAnimatedStyle(() => {
    const wobble = Math.sin(tilt.value * Math.PI * 2); // -1..1, seamless loop
    const hop = Math.sin(bob.value * Math.PI);          // 0..1..0, one arc per loop
    return {
      opacity: stamp.value,
      transform: [
        { perspective: 700 },
        { translateY: -hop * 14 },                        // bounce up and back down
        { scale: 0.7 + stamp.value * 0.3 },
        { scaleY: 1 - hop * 0.04 },                       // subtle stretch at the top
        { rotateY: `${wobble * 16}deg` },                 // 3D side-to-side tilt
        { rotateZ: `${(1 - stamp.value) * -8 + wobble * 2}deg` },
      ],
    };
  });

  return (
    <CurtainStage raised={reveal} style={{ paddingTop: top }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cover, coverStyle]} />
      {step > 0 && (
        <TouchableOpacity style={[styles.backBtn, { top: top + SPACE.SM }]} onPress={back} hitSlop={12}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
      )}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View key={step} entering={FadeIn.duration(350)} style={styles.stepWrap}>
          {step === 0 && (
            <View style={styles.center}>
              <Animated.View style={[styles.logoWrap, logoStyle]}>
                <Animated.Image
                  source={require('../../assets/goldlogo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
                <Sparkle x={LOGO_W * 0.1} y={LOGO_H * 0.20} size={16} delay={0} />
                <Sparkle x={LOGO_W * 0.74} y={LOGO_H * 0.30} size={11} delay={450} />
                <Sparkle x={LOGO_W * 0.60} y={LOGO_H * 0.8} size={13} delay={900} />
                <Sparkle x={LOGO_W * 0.30} y={LOGO_H * 0.58} size={9} delay={1350} />
              </Animated.View>
              <Kicker>Members Only</Kicker>
              <Text style={styles.h1}>Welcome to Vidrip</Text>
              <DecoDivider />
              <Text style={styles.body}>
                You've been let in. Pour yourself something. This is where friends trade clips and react, just for each other.
              </Text>
              <Text style={styles.whisper}>Tell 'em {handle} sent you.</Text>
            </View>
          )}

          {step === 1 && (
            <View style={styles.center}>
              <Kicker>Step One</Kicker>
              <Text style={styles.h2}>Your “For You”</Text>
              <DecoDivider />
              <ForYouMock />
              <Text style={styles.body}>
                Bring your YouTube <Text style={styles.em}>Liked videos</Text> to the table. They show up in your private{' '}
                <Text style={styles.em}>For You</Text> shelf when you go to share, so you always have something good on hand.
              </Text>
              {connected ? (
                <View style={styles.connectedRow}>
                  <Text style={styles.connectedText}>YouTube connected ✓</Text>
                </View>
              ) : (
                <Text style={styles.whisper}>You can do this later in your account.</Text>
              )}
            </View>
          )}

          {step === 2 && (
            <View style={styles.center}>
              <Kicker>Step Two</Kicker>
              <Text style={styles.h2}>Share a clip</Text>
              <DecoDivider />
              <ShareMock />
            </View>
          )}

          {step === 3 && (
            <View style={styles.center}>
              <Kicker>Step Three</Kicker>
              <Text style={styles.h2}>React back</Text>
              <DecoDivider />
              <ReactMock />
            </View>
          )}

          {step === 4 && (
            <View style={styles.center}>
              <Kicker>You're set</Kicker>
              <Text style={styles.h1}>The night is yours</Text>
              <DecoDivider />
              <Text style={[styles.body, { color: C.WHITE}]}>
                That's the whole show. Share what you love. React to what they send.
              </Text>
              <Text style={styles.whisper}>Welcome to the club.</Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Footer: pips + CTAs */}
      <View style={[styles.footer, { paddingBottom: bottom + SPACE.LG }]}>
        <Pips count={STEPS} active={step} />
        <View style={styles.ctaCol}>
          {step === 0 && <DecoButton label="STEP INSIDE" variant="solid" onPress={next} />}

          {step === 1 && (
            connected
              ? <DecoButton label="NEXT" variant="solid" onPress={next} />
              : <>
                  <DecoButton label="CONNECT YOUTUBE" variant="solid" loading={connecting} onPress={connectYouTube} />
                  <DecoButton label="Skip for now" variant="ghost" onPress={next} />
                </>
          )}

          {(step === 2 || step === 3) && <DecoButton label="NEXT" variant="solid" onPress={next} />}

          {step === 4 && <DecoButton label="ENTER" variant="solid" onPress={onDone} />}
        </View>
      </View>
    </CurtainStage>
  );
}

// A twinkling sparkle that pops on a loop (scale + opacity + slow spin).
function Sparkle({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, false));
  }, [t, delay]);
  const style = useAnimatedStyle(() => {
    const p = Math.sin(t.value * Math.PI); // 0 → 1 → 0 twinkle
    return { opacity: p, transform: [{ scale: 0.3 + p * 0.9 }, { rotate: `${t.value * 90}deg` }] };
  });
  return (
    <Animated.Text style={[styles.sparkle, { left: x, top: y, fontSize: size }, style]}>
      ✦
    </Animated.Text>
  );
}

// ── Animated how-to demos (loop forever) ───────────────────────────────────────
const CLAMP = Extrapolation.CLAMP;

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
      <View style={styles.dSteps}>
        <DemoStep p={p} index={1} range={[0, 0.34]} label="Browse or paste a clip" />
        <DemoStep p={p} index={2} range={[0.34, 0.6]} label="Pick a friend" />
        <DemoStep p={p} index={3} range={[0.6, 0.97]} label="Send it over" />
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
      <View style={styles.dSteps}>
        <DemoStep p={p} index={1} range={[0, 0.2]} label="Open a clip a friend sent" />
        <DemoStep p={p} index={2} range={[0.2, 0.5]} label="Tap “Record Your Reaction”" />
        <DemoStep p={p} index={3} range={[0.5, 0.98]} label="They watch you watch it" />
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
    color: (p.value >= range[0] && p.value <= range[1]) ? C.BG : C.GOLD,
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
  // Opaque black backdrop covering the curtain stage until the final step.
  cover: { backgroundColor: C.BG },

  // Curtain photo backdrop (final step)
  curtains: { ...StyleSheet.absoluteFillObject, marginLeft: -35 },
  curtainImg: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  curtainScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,10,9,0.35)' },

  backBtn: { position: 'absolute', left: SPACE.LG, zIndex: 10, paddingVertical: SPACE.XS, paddingRight: SPACE.MD },
  backText: { color: C.MUTED, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.MD },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: SPACE.XL },
  stepWrap: { flex: 1, justifyContent: 'center' },
  center: { alignItems: 'center', gap: SPACE.MD },

  logoWrap: { width: LOGO_W, height: LOGO_H, marginBottom: SPACE.SM },
  logo: { width: LOGO_W, height: LOGO_H },
  // Twinkling sparkles over the coin.
  sparkle: { position: 'absolute', color: '#FFF8E1', textShadowColor: C.GOLD, textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } },
  h1: { fontSize: FONT.SIZES.XXXL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK, textAlign: 'center' },
  h2: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK, textAlign: 'center' },
  body: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.MUTED, textAlign: 'center', lineHeight: 24, maxWidth: 320 },
  em: { color: C.GOLD, fontFamily: FONT.BODY_SEMIBOLD },
  whisper: { fontSize: FONT.SIZES.MD, fontFamily: FONT.DISPLAY_ITALIC, fontStyle: 'italic', color: C.GOLD, textAlign: 'center', marginTop: SPACE.SM },

  connectedRow: { marginTop: SPACE.SM, borderWidth: 1, borderColor: C.GOLD, borderRadius: RADIUS.FULL, paddingHorizontal: SPACE.LG, paddingVertical: SPACE.XS },
  connectedText: { color: C.GOLD, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },

  footer: { paddingHorizontal: SPACE.XL, paddingTop: SPACE.LG, gap: SPACE.LG, borderTopWidth: 1, borderTopColor: C.BORDER },
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
