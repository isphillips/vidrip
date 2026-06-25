import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import type { AuthStackScreenProps } from '../../../app/navigation/types';
import SlimeScribe from '../components/SlimeScribe';
import GradientButton from '../../studio/components/GradientButton';

const BRAND = ['#FF4FA3', '#A05CFF', '#3B82F6'];

// The redeemed invite code gets a hero "ticket" — a brand-gradient ring around the code rendered in
// gradient text, with a teal ✓ chip — so the thing that got the user in the door feels earned and
// special rather than buried in a one-line subtitle.
function InviteTicket({ code }: { code: string }) {
  return (
    <View style={styles.ticket}>
      {/* gradient border via a masked ring (whole border is the gradient, centre is transparent) */}
      <MaskedView style={StyleSheet.absoluteFill} maskElement={<View style={styles.ticketRing} />}>
        <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </MaskedView>

      <View style={styles.ticketHead}>
        <Ionicons name="ticket" size={14} color={C.GOLD} />
        <Text style={styles.ticketLabel}>Your invite</Text>
        <View style={styles.redeemed}>
          <Ionicons name="checkmark-circle" size={13} color={C.TEAL} />
          <Text style={styles.redeemedTxt}>Redeemed</Text>
        </View>
      </View>

      {/* gradient code text */}
      <MaskedView maskElement={<Text style={styles.code}>{code}</Text>}>
        <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <Text style={[styles.code, styles.codeMask]}>{code}</Text>
        </LinearGradient>
      </MaskedView>
    </View>
  );
}

export default function CreateProfileScreen({
  navigation, route,
}: AuthStackScreenProps<'CreateProfile'>) {
  const { inviteCode } = route.params;
  const [email, setEmail] = useState('');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleCreate = async () => {
    // `handle` is already normalized on input (lowercase, [a-z0-9_] only), so this
    // matches exactly what the validation below gated on — no risk of sending an
    // empty/too-short handle that passed a raw-length check.
    const trimmedHandle = handle;
    if (!email.trim() || trimmedHandle.length < 3 || !displayName.trim()) return;

    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: 'vidrip://auth/callback',
          data: {
            handle: trimmedHandle,
            display_name: displayName.trim(),
            invite_code: inviteCode,
          },
        },
      });

      if (authError) {
        Alert.alert('Error', authError.message);
        return;
      }

      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  const isValid =
    email.includes('@') && handle.length >= 3 && displayName.trim().length >= 1;

  // After the magic link is sent, swap to a dedicated confirmation — otherwise the user is
  // dropped back on the form (which reads as "my text vanished"). Mirrors SignInScreen.
  if (sent) {
    return (
      <View style={[styles.container, styles.sentContainer]}>
        <LinearGradient
          colors={['#e056fd', '#8b22a5', '#16e0d5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sentBadge}>
          <Ionicons name="mail-outline" size={42} color={C.WHITE} />
        </LinearGradient>
        <Text style={styles.sentTitle}>Check your email</Text>
        <Text style={styles.sentSubtitle}>
          We sent a magic link to{'\n'}
          <Text style={styles.sentEmail}>{email.trim()}</Text>
        </Text>
        <Text style={styles.sentHint}>
          Tap the link in the email to finish creating your profile. You can close this screen.
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
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <SlimeScribe />

        <Text style={styles.title}>Create your profile</Text>
        <Text style={styles.subtitle}>One last step — make it yours.</Text>

        <InviteTicket code={inviteCode} />

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your Name"
              placeholderTextColor={C.SUBTLE}
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Handle</Text>
            <View style={styles.handleWrap}>
              <Text style={styles.at}>@</Text>
              <TextInput
                style={styles.handleInput}
                value={handle}
                onChangeText={t => setHandle(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="yourhandle"
                placeholderTextColor={C.SUBTLE}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={C.SUBTLE}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <GradientButton
          label="Send Magic Link"
          icon="sparkles"
          onPress={handleCreate}
          disabled={!isValid}
          loading={loading}
          style={styles.cta}
        />
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
  title: {
    fontSize: FONT.SIZES.XXL,
    fontFamily: FONT.DISPLAY_BOLD,
    fontWeight: '700',
    color: C.INK,
    textAlign: 'center',
    marginTop: SPACE.SM,
    marginBottom: SPACE.XS,
  },
  subtitle: {
    fontSize: FONT.SIZES.MD,
    color: C.MUTED,
    textAlign: 'center',
    marginBottom: SPACE.LG,
  },

  // invite ticket
  ticket: {
    backgroundColor: 'rgba(21,10,38,0.6)',
    borderRadius: RADIUS.MD,
    paddingVertical: SPACE.SM,
    paddingHorizontal: SPACE.MD,
    marginBottom: SPACE.LG,
    alignItems: 'center',
  },
  ticketRing: { flex: 1, borderRadius: RADIUS.MD, borderWidth: 1.5, borderColor: '#000', backgroundColor: 'transparent' },
  ticketHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.XS, marginBottom: 2 },
  ticketLabel: {
    fontSize: FONT.SIZES.XS,
    fontFamily: FONT.BODY_BOLD,
    fontWeight: '700',
    color: C.MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  redeemed: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: SPACE.XS },
  redeemedTxt: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_SEMIBOLD, fontWeight: '600', color: C.TEAL },
  code: {
    fontSize: FONT.SIZES.LG,
    fontFamily: FONT.DISPLAY_BOLD,
    fontWeight: '700',
    color: C.INK,
    textAlign: 'center',
    // No letterSpacing: on iOS it leaks into other TextInputs across the app (RN bug).
  },
  codeMask: { opacity: 0 },

  form: {
    gap: SPACE.MD,
  },
  field: {
    gap: SPACE.XS,
  },
  label: {
    fontSize: FONT.SIZES.SM,
    color: C.MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
    paddingVertical: SPACE.LG,
    paddingHorizontal: SPACE.LG,
    fontSize: FONT.SIZES.MD,
    color: C.INK,
  },
  handleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
    paddingLeft: SPACE.LG,
  },
  at: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD, fontWeight: '700', color: C.MUTED },
  handleInput: {
    flex: 1,
    paddingVertical: SPACE.LG,
    paddingHorizontal: SPACE.LG,
    paddingLeft: 2,
    fontSize: FONT.SIZES.MD,
    color: C.INK,
  },
  cta: { marginTop: SPACE.LG },

  // sent confirmation (mirrors SignInScreen)
  sentContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACE.XL,
  },
  sentBadge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.XL,
    shadowColor: C.ACCENT_HOT,
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
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
