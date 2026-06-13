import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import type { AccountStackScreenProps } from '../../../app/navigation/types';

type TotpFactor = { id: string; status: string };
type Enrolling = { id: string; secret: string; uri: string };

// Authenticator-app (TOTP) two-factor setup. No QR rendering on-device — you're
// already on the phone, so we deep-link straight into the authenticator app and
// also show the secret key for manual entry / copy.
export default function TwoFactorScreen({ navigation }: AccountStackScreenProps<'TwoFactor'>) {
  const [factors, setFactors] = useState<TotpFactor[] | null>(null);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyKey = () => {
    if (!enrolling) { return; }
    Clipboard.setString(enrolling.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const load = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(((data?.all ?? []).filter((f) => f.factor_type === 'totp')) as TotpFactor[]);
  };
  useEffect(() => { load(); }, []);

  const verified = factors?.find((f) => f.status === 'verified');

  const startEnroll = async () => {
    setBusy(true);
    try {
      // Drop any abandoned half-set-up factors so they don't accumulate.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of (list?.all ?? [])) {
        if (f.factor_type === 'totp' && f.status === 'unverified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' });
      if (error) { throw error; }
      setEnrolling({ id: data.id, secret: data.totp.secret, uri: data.totp.uri });
    } catch (e) {
      Alert.alert('Could not start setup', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const openAuthenticator = async () => {
    if (!enrolling) { return; }
    try {
      const ok = await Linking.canOpenURL(enrolling.uri);
      if (!ok) { throw new Error('no handler'); }
      await Linking.openURL(enrolling.uri);
    } catch {
      Alert.alert('No authenticator app found',
        'Install Google Authenticator, Authy, or 1Password, then enter the key below manually.');
    }
  };

  const confirmEnroll = async () => {
    if (!enrolling) { return; }
    setBusy(true);
    try {
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enrolling.id });
      if (cErr) { throw cErr; }
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId: enrolling.id, challengeId: ch.id, code: code.trim() });
      if (vErr) { throw vErr; }
      setEnrolling(null);
      setCode('');
      await load();
      Alert.alert('Two-factor enabled', 'You’ll enter a code from your authenticator app when you sign in.');
    } catch (e) {
      Alert.alert('Invalid code', e instanceof Error ? e.message : 'Check the 6-digit code and try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    Alert.alert('Remove two-factor?', 'You’ll sign in without an authenticator code.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          setBusy(true);
          try {
            const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
            if (error) { throw error; }
            await load();
          } catch (e) {
            Alert.alert('Could not remove', e instanceof Error ? e.message : 'Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (factors === null) {
    return <View style={styles.center}><ActivityIndicator color={C.ACCENT} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {verified ? (
        <>
          <Text style={styles.enabledBadge}>🔐 Two-factor is on</Text>
          <Text style={styles.intro}>
            Your account asks for a 6-digit authenticator code at sign-in. Keep your authenticator app safe —
            if you lose it you’ll need to remove two-factor from another signed-in device.
          </Text>
          <TouchableOpacity style={styles.removeBtn} onPress={() => remove(verified.id)} disabled={busy}>
            {busy ? <ActivityIndicator color={C.DANGER} /> : <Text style={styles.removeBtnText}>Remove two-factor</Text>}
          </TouchableOpacity>
        </>
      ) : enrolling ? (
        <>
          <Text style={styles.intro}>
            1. Add Vidrip to your authenticator app, then 2. enter the 6-digit code it shows to confirm.
          </Text>
          <TouchableOpacity style={[styles.primaryBtn, styles.openAuthenticatorButton]} onPress={openAuthenticator}>
            <Text style={styles.primaryBtnText}>Open authenticator app</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Or add this key manually</Text>
          <View style={styles.secretRow}>
            <Text style={styles.secretText} selectable numberOfLines={1} ellipsizeMode="middle">
              {enrolling.secret}
            </Text>
            <TouchableOpacity style={styles.copyBtn} onPress={copyKey} activeOpacity={0.8}>
              <Text style={styles.copyBtnText}>{copied ? 'Copied ✓' : 'Copy'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { marginTop: SPACE.XL }]}>6-digit code</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            placeholderTextColor={C.SUBTLE}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, (busy || code.trim().length < 6) && styles.btnDisabled]}
            onPress={confirmEnroll}
            disabled={busy || code.trim().length < 6}>
            {busy ? <ActivityIndicator color={C.WHITE} /> : <Text style={styles.primaryBtnText}>Confirm & enable</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => { setEnrolling(null); setCode(''); }} disabled={busy}>
            <Text style={styles.ghostBtnText}>Cancel</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.intro}>
            Add an authenticator app (Google Authenticator, Authy, 1Password…) for an extra layer of security.
            You’ll enter a 6-digit code when you sign in.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={startEnroll} disabled={busy}>
            {busy ? <ActivityIndicator color={C.WHITE} /> : <Text style={styles.primaryBtnText}>Set up authenticator</Text>}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  content: { padding: SPACE.LG },
  center: { flex: 1, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center' },
  intro: { fontSize: FONT.SIZES.MD, color: C.MUTED, fontFamily: FONT.BODY, lineHeight: 22, marginBottom: SPACE.XL },
  enabledBadge: { fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, color: C.INK, marginBottom: SPACE.MD },
  label: {
    fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACE.SM,
  },
  secretRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER, borderRadius: RADIUS.MD,
    paddingLeft: SPACE.LG, paddingRight: SPACE.XS, paddingVertical: SPACE.XS,
  },
  secretText: { flex: 1, fontSize: FONT.SIZES.LG, color: C.INK, fontFamily: FONT.BODY, letterSpacing: 2 },
  copyBtn: {
    backgroundColor: C.ACCENT, borderRadius: RADIUS.SM,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD, marginLeft: SPACE.SM, minWidth: 84, alignItems: 'center',
  },
  copyBtnText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
  input: {
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    padding: SPACE.LG, fontSize: FONT.SIZES.LG, color: C.INK, fontFamily: FONT.BODY, letterSpacing: 4,
  },
  primaryBtn: { backgroundColor: C.ACCENT, borderRadius: RADIUS.MD, padding: SPACE.LG, alignItems: 'center', marginTop: SPACE.LG },
  primaryBtnText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
  openAuthenticatorButton: { marginBottom: SPACE.XL },
  btnDisabled: { opacity: 0.4 },
  ghostBtn: { padding: SPACE.MD, alignItems: 'center', marginTop: SPACE.SM },
  ghostBtnText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD },
  removeBtn: {
    borderRadius: RADIUS.MD, padding: SPACE.LG, alignItems: 'center', marginTop: SPACE.LG,
    borderWidth: 1, borderColor: C.DANGER,
  },
  removeBtnText: { color: C.DANGER, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
});
