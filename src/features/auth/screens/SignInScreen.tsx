import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import type { AuthStackScreenProps } from '../../../app/navigation/types';
import SlimeWelcome from '../components/SlimeWelcome';
import SlimeMail from '../components/SlimeMail';
import GradientButton from '../../studio/components/GradientButton';

type Mode = 'magic' | 'password';

export default function SignInScreen({ navigation }: AuthStackScreenProps<'SignIn'>) {
  const [mode, setMode] = useState<Mode>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // Scroll the form into view when a field is focused so the keyboard never covers it (the slime
  // artwork above pushes the inputs down). Delay lets the keyboard + KeyboardAvoidingView settle first.
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
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) { Alert.alert('Sign In Failed', error.message); return; }
      // onAuthStateChange in RootNavigator handles the rest
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.container, styles.sentContainer]}>
        <SlimeMail />
        <Text style={styles.sentTitle}>Check your email</Text>
        <Text style={styles.sentSubtitle}>
          We sent a magic link to{'\n'}
          <Text style={styles.sentEmail}>{email.trim().toLowerCase()}</Text>
        </Text>
        <Text style={styles.sentHint}>
          Tap the link in the email to sign in. You can close this screen.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink} activeOpacity={0.7}>
          <Text style={styles.backLinkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SlimeWelcome />

        {/* Mode toggle */}
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'magic' && styles.toggleBtnActive]}
            onPress={() => setMode('magic')}>
            <Text style={[styles.toggleTxt, mode === 'magic' && styles.toggleTxtActive]}>
              Magic Link
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'password' && styles.toggleBtnActive]}
            onPress={() => setMode('password')}>
            <Text style={[styles.toggleTxt, mode === 'password' && styles.toggleTxtActive]}>
              Password
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>
          {mode === 'magic' ? "We'll email you a one-tap link" : 'Sign in with your email and password'}
        </Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
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
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}>
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'magic' ? (
          <GradientButton
            label="Send Magic Link"
            icon="sparkles"
            onPress={handleMagicLink}
            disabled={!validEmail}
            loading={loading}
            style={styles.cta}
          />
        ) : (
          <GradientButton
            label="Sign In"
            onPress={handlePasswordSignIn}
            disabled={!validEmail || !password}
            loading={loading}
            style={styles.cta}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.BG,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACE.XL,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    padding: 3,
    gap: 3,
    marginTop: SPACE.XXL,
    marginBottom: SPACE.LG,
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: SPACE.SM,
    alignItems: 'center',
    borderRadius: RADIUS.SM,
  },
  toggleBtnActive: { backgroundColor: C.ACCENT },
  toggleTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  toggleTxtActive: { color: C.WHITE },
  subtitle: {
    fontSize: FONT.SIZES.MD,
    color: C.MUTED,
    fontFamily: FONT.BODY,
    marginBottom: SPACE.LG,
    textAlign: 'center'
  },
  input: {
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
    padding: SPACE.LG,
    fontSize: FONT.SIZES.MD,
    color: C.INK,
    fontFamily: FONT.BODY,
    marginBottom: SPACE.MD,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
    marginBottom: SPACE.MD,
  },
  passwordInput: {
    flex: 1,
    padding: SPACE.LG,
    fontSize: FONT.SIZES.MD,
    color: C.INK,
    fontFamily: FONT.BODY,
  },
  eyeBtn: { paddingHorizontal: SPACE.MD },
  eyeIcon: { fontSize: 18 },
  cta: { marginTop: SPACE.SM },
  sentContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: SPACE.XL,
  },
  sentTitle: {
    fontSize: FONT.SIZES.XXXL,
    fontFamily: FONT.DISPLAY_BOLD,
    fontWeight: '700',
    color: C.INK,
    textAlign: 'center',
    marginBottom: SPACE.MD,
  },
  sentSubtitle: {
    fontSize: FONT.SIZES.MD,
    fontFamily: FONT.BODY,
    color: C.MUTED,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACE.XL,
  },
  sentEmail: { color: C.ACCENT_HOT, fontFamily: FONT.DISPLAY_SEMIBOLD },
  sentHint: {
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY,
    color: C.SUBTLE,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  backLink: {
    marginTop: SPACE.XXL,
    paddingVertical: SPACE.SM,
    paddingHorizontal: SPACE.XL,
    borderRadius: RADIUS.FULL,
    borderWidth: 1,
    borderColor: C.BORDER_STRONG,
  },
  backLinkText: { color: C.ACCENT_HOT, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD },
});
