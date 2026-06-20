import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchDeletionStatus,
  sendAccountDeleteOtp,
  requestAccountDeletion,
  cancelAccountDeletion,
} from '../../../infrastructure/supabase/queries/account';
import type { AccountStackScreenProps } from '../../../app/navigation/types';

export default function AccountAdvancedScreen({ navigation }: AccountStackScreenProps<'AccountAdvanced'>) {
  const { profile, user, setProfile, signOut } = useAuthStore();

  // ── Privacy (moved from the main Account screen) ────────────────────────────
  const showReactions = !!(profile as any)?.show_reactions_in_profile;
  const reactAnonymously = !!(profile as any)?.react_anonymously;
  const [savingShowReactions, setSavingShowReactions] = useState(false);
  const [savingAnon, setSavingAnon] = useState(false);

  const handleToggleShowReactions = async (next: boolean) => {
    if (!user?.id || savingShowReactions) { return; }
    setSavingShowReactions(true);
    const { error } = await (supabase as any)
      .from('users').update({ show_reactions_in_profile: next }).eq('id', user.id);
    setSavingShowReactions(false);
    if (error) { Alert.alert('Error', 'Could not update this setting.'); return; }
    if (profile) { setProfile({ ...(profile as any), show_reactions_in_profile: next }); }
  };

  const handleToggleAnon = async (next: boolean) => {
    if (!user?.id || savingAnon) { return; }
    setSavingAnon(true);
    const { error } = await (supabase as any)
      .from('users').update({ react_anonymously: next }).eq('id', user.id);
    setSavingAnon(false);
    if (error) { Alert.alert('Error', 'Could not update this setting.'); return; }
    if (profile) { setProfile({ ...(profile as any), react_anonymously: next }); }
  };

  // ── Account deletion ────────────────────────────────────────────────────────
  const [pendingAt, setPendingAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasTotp, setHasTotp] = useState(false);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);   // delete UI expanded
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');                  // TOTP code (2FA accounts)
  const [otp, setOtp] = useState('');                    // email OTP (no-2FA accounts)
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadState = useCallback(async () => {
    if (!user?.id) { return; }
    try { setPendingAt(await fetchDeletionStatus(user.id)); } catch { /* ignore */ }
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = (data?.all ?? []).find((f) => f.factor_type === 'totp' && f.status === 'verified');
      setHasTotp(!!totp);
      setTotpFactorId(totp?.id ?? null);
    } catch { /* ignore */ }
    setLoaded(true);
  }, [user?.id]);

  useFocusEffect(useCallback(() => { loadState(); }, [loadState]));

  const resetConfirm = () => {
    setConfirming(false); setPassword(''); setCode(''); setOtp(''); setOtpSent(false);
  };

  const sendOtp = async () => {
    setBusy(true);
    try { await sendAccountDeleteOtp(); setOtpSent(true); }
    catch (e: any) { Alert.alert('Error', e?.message ?? 'Could not send the code.'); }
    finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      if (hasTotp) {
        // Step the session up to AAL2 with a fresh TOTP code, then delete with password.
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel !== 'aal2') {
          if (!totpFactorId) { throw new Error('No authenticator enrolled.'); }
          const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: totpFactorId });
          if (cErr) { throw cErr; }
          const { error: vErr } = await supabase.auth.mfa.verify({ factorId: totpFactorId, challengeId: ch.id, code: code.trim() });
          if (vErr) { throw vErr; }
        }
        await requestAccountDeletion({ password });
      } else {
        await requestAccountDeletion({ otp });
      }
      resetConfirm();
      await loadState();
      Alert.alert(
        'Deletion scheduled',
        'Your synced accounts were disconnected and your account will be permanently deleted in 30 days. You can cancel here anytime before then.',
      );
    } catch (e: any) {
      Alert.alert('Could not delete', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const startDelete = () => {
    Alert.alert(
      'Delete account?',
      'This disconnects your synced accounts immediately and permanently deletes your Vidrip account after a 30-day grace period.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => setConfirming(true) },
      ],
    );
  };

  const cancelDeletion = async () => {
    setBusy(true);
    try { await cancelAccountDeletion(); await loadState(); }
    catch (e: any) { Alert.alert('Error', e?.message ?? 'Could not cancel.'); }
    finally { setBusy(false); }
  };

  const purgeDate = pendingAt
    ? new Date(new Date(pendingAt).getTime() + 30 * 86_400_000).toLocaleDateString()
    : null;

  const canConfirm = hasTotp ? (!!password && !!code) : (otpSent && !!otp);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Privacy */}
        <Text style={styles.sectionLabel}>Privacy</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={styles.info}>
              <Text style={styles.rowLabel}>Show reactions in profile</Text>
              <Text style={styles.rowHint} numberOfLines={3}>
                Let anyone who opens your profile see and play your recent reactions.
              </Text>
            </View>
            <Switch value={showReactions} onValueChange={handleToggleShowReactions}
              disabled={savingShowReactions} trackColor={{ true: C.ACCENT, false: C.BORDER }} />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.info}>
              <Text style={styles.rowLabel}>React Anonymously</Text>
              <Text style={styles.rowHint} numberOfLines={3}>
                Hide your face behind a silhouette and lower your voice in every video you record.
              </Text>
            </View>
            <Switch value={reactAnonymously} onValueChange={handleToggleAnon}
              disabled={savingAnon} trackColor={{ true: C.ACCENT, false: C.BORDER }} />
          </View>
        </View>

        {/* Security */}
        <Text style={styles.sectionLabel}>Security</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('TwoFactor')}>
            <Text style={styles.rowLabel}>Two-Factor Authentication</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Danger zone */}
        <Text style={[styles.sectionLabel, { color: C.ACCENT_HOT }]}>Danger Zone</Text>
        <View style={[styles.section, styles.dangerSection]}>
          {!loaded ? (
            <View style={styles.loadingRow}><ActivityIndicator color={C.ACCENT} /></View>
          ) : pendingAt ? (
            <View style={styles.dangerBody}>
              <Text style={styles.rowLabel}>Account scheduled for deletion</Text>
              <Text style={styles.rowHint}>
                Your account will be permanently deleted on {purgeDate}. Disconnected social accounts were
                removed and aren’t restored — reconnect them in Account. Cancel below to keep your account.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={cancelDeletion} disabled={busy}>
                {busy ? <ActivityIndicator color={C.WHITE} /> : <Text style={styles.primaryBtnText}>Keep my account</Text>}
              </TouchableOpacity>
            </View>
          ) : !confirming ? (
            <View style={styles.dangerBody}>
              <Text style={styles.rowHint}>
                Removes your synced accounts and their imported data immediately, and permanently erases your
                Vidrip account after a 30-day grace period. You can cancel within those 30 days.
              </Text>
              <TouchableOpacity style={styles.deleteBtn} onPress={startDelete}>
                <Text style={styles.deleteBtnText}>Delete my account</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.dangerBody}>
              {hasTotp ? (
                <>
                  <Text style={styles.rowHint}>Confirm with your authenticator code and password.</Text>
                  <TextInput style={styles.input} value={code} onChangeText={setCode}
                    placeholder="6-digit code" placeholderTextColor={C.SUBTLE}
                    keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
                  <TextInput style={styles.input} value={password} onChangeText={setPassword}
                    placeholder="Password" placeholderTextColor={C.SUBTLE}
                    secureTextEntry autoComplete="current-password" autoCapitalize="none" />
                </>
              ) : !otpSent ? (
                <>
                  <Text style={styles.rowHint}>We’ll email a confirmation code to verify it’s you.</Text>
                  <TouchableOpacity style={styles.primaryBtn} onPress={sendOtp} disabled={busy}>
                    {busy ? <ActivityIndicator color={C.WHITE} /> : <Text style={styles.primaryBtnText}>Email me a code</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.rowHint}>Enter the 6-digit code we emailed you.</Text>
                  <TextInput style={styles.input} value={otp} onChangeText={setOtp}
                    placeholder="123456" placeholderTextColor={C.SUBTLE}
                    keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
                </>
              )}
              {(hasTotp || otpSent) && (
                <TouchableOpacity style={[styles.deleteBtn, (!canConfirm || busy) && styles.btnDisabled]}
                  onPress={confirmDelete} disabled={!canConfirm || busy}>
                  {busy ? <ActivityIndicator color={C.WHITE} /> : <Text style={styles.deleteBtnText}>Permanently delete</Text>}
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.ghostBtn} onPress={resetConfirm} disabled={busy}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.signOutRow} onPress={() => {
          Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: async () => { await supabase.auth.signOut(); signOut(); } },
          ]);
        }}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.BG },
  container: { flex: 1, backgroundColor: C.BG },
  content: { padding: SPACE.LG },
  section: {
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, marginBottom: SPACE.MD,
    overflow: 'hidden', borderWidth: 1, borderColor: C.BORDER,
  },
  dangerSection: { borderColor: C.ACCENT_HOT },
  divider: { height: 1, backgroundColor: C.BORDER, marginHorizontal: SPACE.LG },
  sectionLabel: {
    fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACE.SM, marginLeft: SPACE.XS,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACE.LG },
  info: { gap: 2, flex: 1, paddingRight: SPACE.MD },
  rowLabel: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM, color: C.INK },
  rowHint: { fontSize: FONT.SIZES.XS, color: C.MUTED, fontFamily: FONT.BODY, lineHeight: 17, marginTop: 4 },
  rowChevron: { fontSize: FONT.SIZES.LG, color: C.MUTED },
  loadingRow: { padding: SPACE.LG, alignItems: 'center' },
  dangerBody: { padding: SPACE.LG, gap: SPACE.MD },
  input: {
    backgroundColor: C.BG, borderRadius: RADIUS.SM, borderWidth: 1, borderColor: C.BORDER,
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.MD, fontSize: FONT.SIZES.MD,
    color: C.INK, fontFamily: FONT.BODY,
  },
  primaryBtn: { backgroundColor: C.ACCENT, borderRadius: RADIUS.SM, padding: SPACE.MD, alignItems: 'center' },
  primaryBtnText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD },
  deleteBtn: { backgroundColor: C.ACCENT_HOT, borderRadius: RADIUS.SM, padding: SPACE.MD, alignItems: 'center' },
  deleteBtnText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD },
  btnDisabled: { opacity: 0.4 },
  ghostBtn: { padding: SPACE.SM, alignItems: 'center' },
  ghostBtnText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD },
  signOutRow: { padding: SPACE.LG, alignItems: 'center', marginTop: SPACE.SM },
  signOutText: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.DANGER },
});
