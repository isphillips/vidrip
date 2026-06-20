import React, { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import SlimeGuard from '../components/SlimeGuard';
import GradientButton from '../../studio/components/GradientButton';

// Second-factor gate shown after sign-in when the account has a verified
// authenticator (session sits at AAL1 until the TOTP code lifts it to AAL2).
export default function MfaChallengeScreen({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Keep the code field above the keyboard (it auto-focuses on mount).
  const scrollRef = useRef<ScrollView>(null);
  const focusScroll = () => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250); };

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) { throw error; }
      const totp = (data?.all ?? []).find((f) => f.factor_type === 'totp' && f.status === 'verified');
      if (!totp) { throw new Error('No authenticator enrolled.'); }
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (cErr) { throw cErr; }
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: ch.id, code: code.trim() });
      if (vErr) { throw vErr; }
      onVerified();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid code'); setBusy(false);
    }
  };

  return (
    <LinearGradient
      colors={['#2A0E4E', '#190A33', '#0B0518']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets>
        <SlimeGuard />
        <Text style={styles.title}>Two-factor</Text>
        <Text style={styles.sub}>Enter the current 6-digit code from your authenticator app.</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor={C.SUBTLE}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          onFocus={focusScroll}
        />
        {!!err && <Text style={styles.err}>{err}</Text>}
        <GradientButton
          label="Verify"
          icon="lock-open-outline"
          onPress={submit}
          disabled={code.trim().length < 6}
          loading={busy}
          style={styles.cta}
        />
        <TouchableOpacity style={styles.ghost} onPress={() => supabase.auth.signOut()} disabled={busy}>
          <Text style={styles.ghostText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL, gap: SPACE.SM },
  title: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK, textTransform: 'uppercase' },
  sub: { fontSize: FONT.SIZES.MD, color: C.MUTED, fontFamily: FONT.BODY, textAlign: 'center', lineHeight: 22, marginBottom: SPACE.MD },
  input: {
    width: '100%', backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    // No letterSpacing: on iOS it leaks into other TextInputs across the app (RN bug).
    padding: SPACE.LG, fontSize: FONT.SIZES.XL, color: C.INK, fontFamily: FONT.BODY, textAlign: 'center',
  },
  err: { color: C.DANGER, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  cta: { width: '100%', marginTop: SPACE.SM },
  ghost: { padding: SPACE.MD, marginTop: SPACE.SM },
  ghostText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD },
});
