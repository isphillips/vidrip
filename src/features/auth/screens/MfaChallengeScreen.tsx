import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';

// Second-factor gate shown after sign-in when the account has a verified
// authenticator (session sits at AAL1 until the TOTP code lifts it to AAL2).
export default function MfaChallengeScreen({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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
    <View style={styles.container}>
      <LinearGradient
        colors={['#e056fd', '#8b22a5', '#16e0d5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.badge}>
        <Ionicons name="shield-checkmark-outline" size={42} color={C.WHITE} />
      </LinearGradient>
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
      />
      {!!err && <Text style={styles.err}>{err}</Text>}
      <TouchableOpacity
        style={[styles.btn, (busy || code.trim().length < 6) && styles.btnDisabled]}
        onPress={submit}
        disabled={busy || code.trim().length < 6}>
        {busy ? <ActivityIndicator color={C.WHITE} /> : <Text style={styles.btnText}>Verify</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.ghost} onPress={() => supabase.auth.signOut()} disabled={busy}>
        <Text style={styles.ghostText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL, gap: SPACE.SM },
  badge: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACE.MD,
    shadowColor: C.ACCENT_HOT, shadowOpacity: 0.6, shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  title: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK, textTransform: 'uppercase' },
  sub: { fontSize: FONT.SIZES.MD, color: C.MUTED, fontFamily: FONT.BODY, textAlign: 'center', lineHeight: 22, marginBottom: SPACE.MD },
  input: {
    width: '100%', backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    padding: SPACE.LG, fontSize: FONT.SIZES.XL, color: C.INK, fontFamily: FONT.BODY, letterSpacing: 6, textAlign: 'center',
  },
  err: { color: C.DANGER, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  btn: { width: '100%', backgroundColor: C.ACCENT, borderRadius: RADIUS.MD, padding: SPACE.LG, alignItems: 'center', marginTop: SPACE.SM },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
  ghost: { padding: SPACE.MD, marginTop: SPACE.SM },
  ghostText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD },
});
