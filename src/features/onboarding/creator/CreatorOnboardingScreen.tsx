import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, Keyboard,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler, withTiming,
  Easing, interpolate, Extrapolation, type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { W, H, GOLD, SceneBackdrop, HeroDrippy, CopyScrim, TEXT_GLOW } from '../../../components/scene/sceneKit';
import { Kicker, DecoDivider, Pips } from '../components';
import GradientButton from '../../studio/components/GradientButton';
import { joinEarlyAccess, isLikelyEmail } from '../../../infrastructure/supabase/queries/earlyAccess';
import { StudioVignette, TwoViewVignette, LoyaltyVignette } from './creatorVignettes';

// ════════════════════════════════════════════════════════════════════════════════════════════
//  Creator onboarding — the cinematic, pre-auth pitch shown to influencers during the closed
//  launch (gated by CREATOR_INTRO, mounted from RootNavigator's signed-out branch).
//
//  A swipeable, parallaxing tour through the slime-land — welcome → the Studio → the two-view
//  concept → the members club — riding on the shared <SceneBackdrop> so it feels like one 
//  continuous world. Skippable at any time (jumps to the email capture); the capture markets 
//  exclusivity, takes an email for a spot, and has a subtle "log in" link that drops devs/returning
//  creators into the auth flow.
// ════════════════════════════════════════════════════════════════════════════════════════════

type Vignette = React.ComponentType | null;
const SCENES: { kicker: string; title: string; body: string; Vignette: Vignette }[] = [
  {
    kicker: 'By invitation',
    title: 'You found\nthe drip',
    body: 'A new home built for creators. Come meet the crew and see why your fans will follow you here.',
    Vignette: null, // hero Drippy waves you in
  },
  {
    kicker: 'Create',
    title: 'Your studio,\nyour set',
    body: 'Shoot, trim, color, score and add lenses. Have a whole creator studio in your pocket. Post finished drip without ever leaving the app.',
    Vignette: StudioVignette,
  },
  {
    kicker: 'The Vidrip edge',
    title: 'Two screens,\none you',
    body: 'Link the socials you already post to. Your views keep racking up where they live. Meanwhile your real fanbase gathers here, on Vidrip. Reach and loyalty, at once.',
    Vignette: TwoViewVignette,
  },
  {
    kicker: 'Belong',
    title: 'Build a club,\nnot a crowd',
    body: 'Drop members-only reactions, lock your best stuff behind the velvet rope, and turn followers into a fiercely loyal inner circle.',
    Vignette: LoyaltyVignette,
  },
];
const LAST = SCENES.length - 1;

// One cinematic scene — its content drifts, scales and fades as it crosses centre (parallax focus).
function Scene({ index, scrollX, enter, children }: {
  index: number; scrollX: SharedValue<number>; enter: SharedValue<number>; children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const style = useAnimatedStyle(() => {
    const range = [(index - 1) * W, index * W, (index + 1) * W];
    const dist = Math.abs(scrollX.value - index * W) / W;
    return {
      opacity: interpolate(dist, [0, 0.7, 1], [1, 0.25, 0], Extrapolation.CLAMP) * enter.value,
      transform: [
        { translateX: interpolate(scrollX.value, range, [W * 0.22, 0, -W * 0.22], Extrapolation.CLAMP) },
        { scale: interpolate(dist, [0, 1], [1, 0.86], Extrapolation.CLAMP) },
      ],
    };
  });
  return (
    <View style={[styles.page, { width: W }]}>
      <Animated.View style={[styles.pageInner, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 150 }, style]}>
        {children}
      </Animated.View>
    </View>
  );
}

export default function CreatorOnboardingScreen({ onLogin }: { onLogin: () => void }) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);
  const enter = useSharedValue(0);
  const phase = useSharedValue(0); // 0 = tour, 1 = form
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<'tour' | 'form'>('tour');

  // email capture state
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);

  React.useEffect(() => {
    enter.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [enter]);

  const onScroll = useAnimatedScrollHandler({ onScroll: e => { scrollX.value = e.contentOffset.x; } });

  const goTo = (p: number) => scrollRef.current?.scrollTo({ x: p * W, animated: true });
  const next = () => { if (page < LAST) { goTo(page + 1); } else { openForm(); } };
  const back = () => { if (page > 0) { goTo(page - 1); } };

  const openForm = () => {
    Keyboard.dismiss();
    setMode('form');
    phase.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
  };
  const backToTour = () => {
    Keyboard.dismiss();
    setMode('tour');
    phase.value = withTiming(0, { duration: 460, easing: Easing.out(Easing.cubic) });
  };

  const submit = async () => {
    if (!isLikelyEmail(email) || submitting) { return; }
    Keyboard.dismiss();
    setSubmitting(true);
    try {
      await joinEarlyAccess(email);
      setJoined(true);
    } catch {
      Alert.alert('Hmm', "Couldn't save your spot just now. Give it another try in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  const tourStyle = useAnimatedStyle(() => ({
    opacity: 1 - phase.value,
    transform: [{ translateX: -phase.value * 40 }],
  }));
  const formStyle = useAnimatedStyle(() => ({
    opacity: phase.value,
    transform: [{ translateY: interpolate(phase.value, [0, 1], [40, 0]) }],
  }));
  const skipStyle = useAnimatedStyle(() => ({ opacity: (1 - phase.value) * enter.value }));

  return (
    <View style={styles.root}>
      {/* the shared dusk slime-land, parallaxing as you swipe */}
      <SceneBackdrop enter={enter} scrollX={scrollX} />

      {/* ── TOUR ─────────────────────────────────────────────────────────── */}
      <Animated.View style={[StyleSheet.absoluteFill, tourStyle]} pointerEvents={mode === 'tour' ? 'auto' : 'none'}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={e => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}>
          {SCENES.map((s, i) => {
            const V = s.Vignette;
            return (
              <Scene key={i} index={i} scrollX={scrollX} enter={enter}>
                <View style={styles.stageSlot}>
                  {V ? <V /> : <HeroDrippy enter={enter} width={Math.min(132, W * 0.32)} />}
                </View>
                <View style={styles.copyBlock}>
                  <CopyScrim style={styles.copyScrim} />
                  <Kicker>{s.kicker}</Kicker>
                  <Text style={styles.title}>{s.title}</Text>
                  <DecoDivider />
                  <Text style={styles.body}>{s.body}</Text>
                </View>
              </Scene>
            );
          })}
        </Animated.ScrollView>

        {/* back (after the first scene) + skip */}
        {page > 0 && (
          <Animated.View style={[styles.tourBack, { top: insets.top + SPACE.SM }, skipStyle]}>
            <TouchableOpacity onPress={back} hitSlop={12} activeOpacity={0.7} style={styles.backRow}>
              <Ionicons name="chevron-back" size={18} color={C.INK} />
              <Text style={styles.skipTxt}>Back</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
        <Animated.View style={[styles.skipWrap, { top: insets.top + SPACE.SM }, skipStyle]}>
          <TouchableOpacity onPress={openForm} hitSlop={12} activeOpacity={0.7}>
            <Text style={styles.skipTxt}>Skip ›</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* footer: pips + advance */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + SPACE.LG }]}>
          <Pips count={SCENES.length} active={page} />
          <GradientButton
            label={page === LAST ? 'CLAIM YOUR SPOT' : 'NEXT'}
            icon={page === LAST ? 'sparkles' : 'arrow-forward'}
            onPress={next}
          />
        </View>
      </Animated.View>

      {/* ── FORM CAPTURE ─────────────────────────────────────────────────── */}
      <Animated.View style={[StyleSheet.absoluteFill, formStyle]} pointerEvents={mode === 'form' ? 'auto' : 'none'}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={[styles.formScroll, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + SPACE.XL }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* back to tour */}
            <TouchableOpacity style={[styles.backWrap, { top: insets.top + SPACE.SM }]} onPress={backToTour} hitSlop={12} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={18} color={C.INK} />
              <Text style={styles.backTxt}>Tour</Text>
            </TouchableOpacity>

            <View style={styles.formHero}><HeroDrippy enter={enter} width={Math.min(118, W * 0.3)} waving={false} /></View>

            {joined ? (
              <View style={styles.center}>
                <CopyScrim style={styles.copyScrim} />
                <View style={styles.checkRing}><Ionicons name="checkmark" size={34} color={GOLD} /></View>
                <Text style={styles.title}>You're on{'\n'}the list</Text>
                <DecoDivider />
                <Text style={styles.body}>Welcome to the inner circle. We'll reach out the moment your creator spot is ready. Keep an eye on your inbox.</Text>
              </View>
            ) : (
              <View style={styles.center}>
                <CopyScrim style={styles.copyScrim} />
                <Kicker>By invitation only</Kicker>
                <Text style={styles.title}>Claim your{'\n'}spot</Text>
                <DecoDivider />
                <Text style={styles.body}>We're opening Vidrip to a first class of creators. Drop your email to hold your place in line. Spots are limited and going fast.</Text>

                <View style={styles.inputRow}>
                  <Ionicons name="mail" size={18} color={C.MUTED} style={{ marginRight: SPACE.SM }} />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@vidrip.app"
                    placeholderTextColor={C.SUBTLE}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={submit}
                  />
                </View>
                <GradientButton
                  label="REQUEST MY SPOT"
                  icon="sparkles"
                  onPress={submit}
                  loading={submitting}
                  disabled={!isLikelyEmail(email)}
                  style={styles.cta}
                />
              </View>
            )}

            {/* subtle path to login (devs / returning creators) */}
            <TouchableOpacity style={styles.loginLink} onPress={onLogin} hitSlop={10} activeOpacity={0.7}>
              <Text style={styles.loginTxt}>Already have access?  <Text style={styles.loginEm}>Log in</Text></Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#160826' },
  flex: { flex: 1 },

  // tour pages
  page: { height: H },
  pageInner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.XL, gap: SPACE.MD },
  stageSlot: { height: 212, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.SM },
  // copy block + its feathered scrim (extends past the page padding to the screen edges)
  copyBlock: { alignSelf: 'stretch', alignItems: 'center', gap: SPACE.MD, paddingVertical: SPACE.XXXL },
  copyScrim: { left: -SPACE.XL, right: -SPACE.XL, top: -SPACE.SM, bottom: -SPACE.SM },
  title: { fontSize: FONT.SIZES.XXXL, fontFamily: FONT.DISPLAY_BOLD, fontWeight: '700', color: C.WHITE, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 36, ...TEXT_GLOW },
  body: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.INK, textAlign: 'center', lineHeight: 24, maxWidth: 330, ...TEXT_GLOW },

  skipWrap: { position: 'absolute', right: SPACE.LG },
  tourBack: { position: 'absolute', left: SPACE.LG },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  skipTxt: { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD, letterSpacing: 0.5, ...TEXT_GLOW },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SPACE.XL, paddingTop: SPACE.LG, gap: SPACE.LG },

  // form
  formScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: SPACE.XL },
  backWrap: { position: 'absolute', left: SPACE.LG, flexDirection: 'row', alignItems: 'center', gap: 2, zIndex: 10 },
  backTxt: { color: C.INK, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.MD, ...TEXT_GLOW },
  formHero: { alignItems: 'center', marginBottom: SPACE.MD },
  center: { alignItems: 'center', gap: SPACE.MD },
  checkRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: GOLD, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.SM },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', maxWidth: 360,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    paddingHorizontal: SPACE.LG, marginTop: SPACE.MD,
  },
  input: { flex: 1, paddingVertical: SPACE.LG, fontSize: FONT.SIZES.LG, color: C.INK, fontFamily: FONT.BODY },
  cta: { alignSelf: 'stretch', maxWidth: 360, marginTop: SPACE.MD },

  loginLink: { alignItems: 'center', marginTop: SPACE.XL, paddingVertical: SPACE.SM },
  loginTxt: { color: C.INK, fontFamily: FONT.BODY, fontSize: FONT.SIZES.SM, ...TEXT_GLOW },
  loginEm: { color: GOLD, fontFamily: FONT.BODY_BOLD },
});
