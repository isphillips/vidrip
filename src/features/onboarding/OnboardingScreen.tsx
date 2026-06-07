import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Linking, Alert, ScrollView,
} from 'react-native';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { useOAuthStore } from '../../store/oauthStore';
import { buildAuthUrl } from '../../infrastructure/oauth/config';
import { syncOAuthCode } from '../../infrastructure/supabase/queries/syncedAccounts';
import { refreshConnectedFeed } from '../../infrastructure/supabase/queries/connectedFeed';
import { DecoDivider, Kicker, Pips, DecoButton } from './components';

const STEPS = 5;

export default function OnboardingScreen({ onDone }: { mode: 'firstRun' | 'replay'; onDone: () => void }) {
  const { top, bottom } = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const handle = profile?.handle ? `@${profile.handle}` : 'a friend';

  const [step, setStep] = useState(0);
  const next = () => setStep(s => Math.min(s + 1, STEPS - 1));

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

  // Wax-seal stamp for the splash logo.
  const stamp = useSharedValue(0);
  useEffect(() => { stamp.value = withDelay(120, withTiming(1, { duration: 600, easing: Easing.out(Easing.back(1.6)) })); }, [stamp]);
  const stampStyle = useAnimatedStyle(() => ({
    opacity: stamp.value,
    transform: [{ scale: 0.7 + stamp.value * 0.3 }, { rotate: `${(1 - stamp.value) * -8}deg` }],
  }));

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View key={step} entering={FadeIn.duration(350)} style={styles.stepWrap}>
          {step === 0 && (
            <View style={styles.center}>
              <Animated.Image
                source={require('../../assets/goldlogo.png')}
                style={[styles.logo, stampStyle]}
                resizeMode="contain"
              />
              <Kicker>Members Only</Kicker>
              <Text style={styles.h1}>Welcome to Vidrip</Text>
              <DecoDivider />
              <Text style={styles.body}>
                You've been let in. Pour yourself something — this is where friends trade clips and react, just for each other.
              </Text>
              <Text style={styles.whisper}>Tell 'em {handle} sent you.</Text>
            </View>
          )}

          {step === 1 && (
            <View style={styles.center}>
              <Kicker>Step One</Kicker>
              <Text style={styles.h2}>Your “For You”</Text>
              <DecoDivider />
              <Text style={styles.body}>
                Bring your YouTube <Text style={styles.em}>Liked videos</Text> to the table. They show up in your private{' '}
                <Text style={styles.em}>For You</Text> shelf when you go to share — so you always have something good on hand.
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
              <Text style={styles.h2}>Pass a clip</Text>
              <DecoDivider />
              <ShareMock />
              <Steps items={['Browse or paste a clip', 'Pick a friend', 'Send it over']} />
            </View>
          )}

          {step === 3 && (
            <View style={styles.center}>
              <Kicker>Step Three</Kicker>
              <Text style={styles.h2}>React back</Text>
              <DecoDivider />
              <ReactMock />
              <Steps items={['Open a clip a friend sent', 'Tap “Record Your Reaction”', 'They watch you watch it']} />
            </View>
          )}

          {step === 4 && (
            <View style={styles.center}>
              <Kicker>You're set</Kicker>
              <Text style={styles.h1}>The night is yours</Text>
              <DecoDivider />
              <Text style={styles.body}>
                That's the whole show — share what you love, react to what they send. Welcome to the club.
              </Text>
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
    </View>
  );
}

// ── Stylized mock UI for the how-to steps ──────────────────────────────────────
function ShareMock() {
  return (
    <View style={styles.mockRow}>
      <View style={styles.mockCard}>
        <View style={styles.mockThumb}><Text style={styles.mockGlyph}>▶</Text></View>
        <View style={styles.mockLine} />
        <View style={[styles.mockLine, { width: '60%' }]} />
      </View>
      <Text style={styles.mockArrow}>→</Text>
      <View style={styles.mockChip}>
        <View style={styles.mockAvatar}><Text style={styles.mockAvatarText}>A</Text></View>
        <View style={[styles.mockLine, { width: 36, marginTop: SPACE.XS }]} />
        <View style={styles.mockSend}><Text style={styles.mockSendText}>Send</Text></View>
      </View>
    </View>
  );
}

function ReactMock() {
  return (
    <View style={styles.mockRow}>
      <View style={styles.mockCard}>
        <View style={styles.mockThumb}><Text style={styles.mockGlyph}>▶</Text></View>
        <View style={styles.mockReactBtn}><Text style={styles.mockReactText}>Record Your Reaction</Text></View>
      </View>
      <Text style={styles.mockArrow}>→</Text>
      <View style={styles.mockBubble}>
        <View style={styles.mockFace}><Text style={styles.mockGlyph}>☺</Text></View>
        <Text style={styles.mockBubbleText}>😂 🔥</Text>
      </View>
    </View>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <View style={styles.stepsList}>
      {items.map((t, i) => (
        <View key={i} style={styles.stepLine}>
          <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
          <Text style={styles.stepText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: SPACE.XL },
  stepWrap: { flex: 1, justifyContent: 'center' },
  center: { alignItems: 'center', gap: SPACE.MD },

  logo: { width: 96, height: 104, marginBottom: SPACE.SM },
  h1: { fontSize: FONT.SIZES.XXXL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK, textAlign: 'center' },
  h2: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK, textAlign: 'center' },
  body: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.MUTED, textAlign: 'center', lineHeight: 24, maxWidth: 320 },
  em: { color: C.GOLD, fontFamily: FONT.BODY_SEMIBOLD },
  whisper: { fontSize: FONT.SIZES.SM, fontFamily: FONT.DISPLAY_ITALIC, fontStyle: 'italic', color: C.SUBTLE, textAlign: 'center', marginTop: SPACE.SM },

  connectedRow: { marginTop: SPACE.SM, borderWidth: 1, borderColor: C.GOLD, borderRadius: RADIUS.FULL, paddingHorizontal: SPACE.LG, paddingVertical: SPACE.XS },
  connectedText: { color: C.GOLD, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },

  footer: { paddingHorizontal: SPACE.XL, paddingTop: SPACE.LG, gap: SPACE.LG, borderTopWidth: 1, borderTopColor: C.BORDER },
  ctaCol: { gap: SPACE.SM },

  // mock UI
  mockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.MD, marginVertical: SPACE.MD },
  mockCard: { width: 116, backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, padding: SPACE.SM, gap: SPACE.XS },
  mockThumb: { height: 70, borderRadius: RADIUS.SM, backgroundColor: C.SURFACE_2, alignItems: 'center', justifyContent: 'center' },
  mockGlyph: { color: C.GOLD_DIM, fontSize: 22 },
  mockLine: { height: 6, borderRadius: 3, backgroundColor: C.BORDER_STRONG, width: '90%' },
  mockArrow: { color: C.GOLD, fontSize: 24, fontFamily: FONT.BODY_BOLD },
  mockChip: { alignItems: 'center', gap: SPACE.XS },
  mockAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.ACCENT_LITE, borderWidth: 1, borderColor: C.ACCENT, alignItems: 'center', justifyContent: 'center' },
  mockAvatarText: { color: C.ACCENT_HOT, fontFamily: FONT.DISPLAY_BOLD, fontSize: FONT.SIZES.LG },
  mockSend: { marginTop: SPACE.XS, backgroundColor: C.GOLD, borderRadius: RADIUS.SM, paddingHorizontal: SPACE.MD, paddingVertical: 4 },
  mockSendText: { color: C.BG, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.XS },
  mockReactBtn: { backgroundColor: C.ACCENT, borderRadius: RADIUS.SM, paddingVertical: 6, alignItems: 'center' },
  mockReactText: { color: C.WHITE, fontFamily: FONT.BODY_BOLD, fontSize: 10 },
  mockBubble: { alignItems: 'center', gap: SPACE.XS },
  mockFace: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.SURFACE_2, borderWidth: 1, borderColor: C.GOLD_DIM, alignItems: 'center', justifyContent: 'center' },
  mockBubbleText: { fontSize: FONT.SIZES.MD },

  // numbered steps
  stepsList: { gap: SPACE.SM, marginTop: SPACE.MD, alignSelf: 'stretch', maxWidth: 320 },
  stepLine: { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD },
  stepNum: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: C.GOLD, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: C.GOLD, fontFamily: FONT.DISPLAY_BOLD, fontSize: FONT.SIZES.SM },
  stepText: { flex: 1, color: C.INK, fontFamily: FONT.BODY, fontSize: FONT.SIZES.MD },
});
