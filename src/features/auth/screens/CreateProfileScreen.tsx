import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import type { AuthStackScreenProps } from '../../../app/navigation/types';

export default function CreateProfileScreen({
  route,
}: AuthStackScreenProps<'CreateProfile'>) {
  const { inviteCode } = route.params;
  const [email, setEmail] = useState('');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    // `handle` is already normalized on input (lowercase, [a-z0-9_] only), so this
    // matches exactly what the validation below gated on — no risk of sending an
    // empty/too-short handle that passed a raw-length check.
    const trimmedHandle = handle;
    if (!email.trim() || trimmedHandle.length < 3 || !displayName.trim()) return;

    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: 'reaxn://auth/callback',
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

      Alert.alert(
        'Check your email',
        `We sent a magic link to ${email.trim()}. Tap it to finish signing in.`,
      );
    } finally {
      setLoading(false);
    }
  };

  const isValid =
    email.includes('@') && handle.length >= 3 && displayName.trim().length >= 1;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.title}>Create your profile</Text>
      <Text style={styles.subtitle}>Invite code: {inviteCode}</Text>

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
          <TextInput
            style={styles.input}
            value={handle}
            onChangeText={t => setHandle(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="yourhandle"
            placeholderTextColor={C.SUBTLE}
            autoCapitalize="none"
            autoCorrect={false}
          />
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

      <TouchableOpacity
        style={[styles.button, (!isValid || loading) && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={!isValid || loading}>
        {loading ? (
          <ActivityIndicator color={C.WHITE} />
        ) : (
          <Text style={styles.buttonText}>Send Magic Link</Text>
        )}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.BG,
    padding: SPACE.XL,
    paddingTop: SPACE.XXXL,
  },
  title: {
    fontSize: FONT.SIZES.XXL,
    fontFamily: FONT.DISPLAY_BOLD,
    fontWeight: '700',
    color: C.INK,
    marginBottom: SPACE.XS,
  },
  subtitle: {
    fontSize: FONT.SIZES.SM,
    color: C.MUTED,
    marginBottom: SPACE.XXL,
  },
  form: {
    flex: 1,
    gap: SPACE.LG,
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
    padding: SPACE.LG,
    fontSize: FONT.SIZES.MD,
    color: C.INK,
  },
  button: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    alignItems: 'center',
    marginBottom: SPACE.XL,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: C.WHITE,
    fontSize: FONT.SIZES.LG,
    fontFamily: FONT.BODY_BOLD,
    fontWeight: '700',
  },
});
