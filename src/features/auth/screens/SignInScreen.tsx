import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, ScrollView, Platform,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, interpolate } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import { CopyScrim, TEXT_GLOW } from '../../../components/scene/sceneKit';
import { AuthScene } from '../components/AuthScene';
import GradientButton from '../../studio/components/GradientButton';
import type { AuthStackScreenProps } from '../../../app/navigation/types';

type Mode = 'magic' | 'password';

export default function SignInScreen({ navigation }: AuthStackScreenProps<'SignIn'>) {
  const { top, bottom } = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const enter = useSharedValue(0);
  useEffect(() => { enter.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }); }, [enter]);
  const formStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: interpolate(enter.value, [0, 1], [0.92, 1]) }],
  }));

  const scrollRef = useRef<ScrollView>(null);
  const focusScroll = () => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 180); };

  const validEmail = email.trim().includes('@');

  const handleMagicLink = async () => {
    if (!validEmail) { return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false, emailRedirectTo: 'vidrip://auth/callback' },
      });
      if (error) { Alert.alert('Error', error.message); return; }
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSignIn = async () => {
    if (!validEmail || password.length < 1) { return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) { Alert.alert('Sign In Failed', error.message); return; }
      // onAuthStateChange in RootNavigator handles the rest
    } finally {
      setLoading(false);
    }
  };

  const BackButton = (
    <TouchableOpacity style={[styles.back, { top: top + SPACE.SM }]} onPress={() => navigation.goBack()} hitSlop={12} activeOpacity={0.75}>
      <Ionicons name="chevron-back" size={22} color={C.INK} />
    </TouchableOpacity>
  );

  if (sent) {
    return (
      <View style={styles.root}>
        <AuthScene gated enter={enter} />
        {BackButton}
        <View style={styles.sentWrap}>
          <Animated.View style={[styles.card, formStyle]}>
            <CopyScrim style={styles.cardScrim} />
            <View style={styles.mailBadge}><Ionicons name="mail-outline" size={34} color={C.WHITE} /></View>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>We sent a magic link to{'\n'}<Text style={styles.email}>{email.trim().toLowerCase()}</Text></Text>
            <Text style={styles.hint}>Tap the link in the email to sign in. You can close this screen.</Text>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AuthScene gated enter={enter} />
      {BackButton}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scroll, { paddingBottom: bottom + SPACE.XL }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.card, formStyle]}>
            <CopyScrim style={styles.cardScrim} />
            <Text style={styles.title}>Welcome back</Text>

            <View style={styles.toggle}>
              <TouchableOpacity style={[styles.toggleBtn, mode === 'magic' && styles.toggleBtnActive]} onPress={() => setMode('magic')}>
                <Text style={[styles.toggleTxt, mode === 'magic' && styles.toggleTxtActive]}>Magic Link</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.toggleBtn, mode === 'password' && styles.toggleBtnActive]} onPress={() => setMode('password')}>
                <Text style={[styles.toggleTxt, mode === 'password' && styles.toggleTxtActive]}>Password</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subtitle}>
              {mode === 'magic' ? "We'll email you a one-tap link" : 'Sign in with your email and password'}
            </Text>

            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@vidrip.app"
              placeholderTextColor={C.SUBTLE}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={focusScroll}
            />

            {mode === 'password' && (
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={C.SUBTLE}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={handlePasswordSignIn}
                  onFocus={focusScroll}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword((v) => !v)}>
                  <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {mode === 'magic' ? (
              <GradientButton label="Send Magic Link" icon="sparkles" onPress={handleMagicLink} disabled={!validEmail} loading={loading} style={styles.cta} />
            ) : (
              <GradientButton label="Sign In" onPress={handlePasswordSignIn} disabled={!validEmail || !password} loading={loading} style={styles.cta} />
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#160826', overflow: 'hidden' },
  flex: { flex: 1 },
  back: {
    position: 'absolute', left: SPACE.LG, zIndex: 10,
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(10,4,20,0.5)',
    borderWidth: 1, borderColor: C.BORDER, alignItems: 'center', justifyContent: 'center',
  },
  scroll: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: SPACE.XL },
  sentWrap: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: SPACE.XL, paddingBottom: SPACE.XXXL },

  card: { alignItems: 'center', alignSelf: 'stretch', gap: SPACE.SM, paddingVertical: SPACE.LG },
  cardScrim: { left: -SPACE.XL, right: -SPACE.XL, top: -SPACE.MD, bottom: -SPACE.XXL },
  title: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD, fontWeight: '700', color: C.WHITE, textAlign: 'center', marginBottom: SPACE.XS, ...TEXT_GLOW },

  toggle: {
    flexDirection: 'row', alignSelf: 'stretch', backgroundColor: C.SURFACE, borderRadius: RADIUS.MD,
    padding: 3, gap: 3, borderWidth: 1, borderColor: C.BORDER,
  },
  toggleBtn: { flex: 1, paddingVertical: SPACE.SM, alignItems: 'center', borderRadius: RADIUS.SM },
  toggleBtnActive: { backgroundColor: C.ACCENT },
  toggleTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  toggleTxtActive: { color: C.WHITE },
  subtitle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.INK, textAlign: 'center', ...TEXT_GLOW },

  input: {
    alignSelf: 'stretch', backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    padding: SPACE.LG, fontSize: FONT.SIZES.MD, color: C.INK, fontFamily: FONT.BODY, marginTop: SPACE.XS,
  },
  passwordRow: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
  },
  passwordInput: { flex: 1, padding: SPACE.LG, fontSize: FONT.SIZES.MD, color: C.INK, fontFamily: FONT.BODY },
  eyeBtn: { paddingHorizontal: SPACE.MD },
  eyeIcon: { fontSize: 18 },
  cta: { alignSelf: 'stretch', marginTop: SPACE.XS },

  // sent confirmation
  mailBadge: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.SM,
    backgroundColor: C.ACCENT,
  },
  email: { color: C.ACCENT_HOT, fontFamily: FONT.DISPLAY_SEMIBOLD },
  hint: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED, textAlign: 'center', lineHeight: 20, maxWidth: 280, ...TEXT_GLOW },
});
