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
  ScrollView,
} from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import type { AccountStackScreenProps } from '../../../app/navigation/types';

export default function PasswordSetupScreen({
  navigation,
}: AccountStackScreenProps<'PasswordSetup'>) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const isValid = password.length >= 8 && password === confirm;

  const handleSave = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View style={styles.doneContainer}>
        <Text style={styles.doneIcon}>🔐</Text>
        <Text style={styles.doneTitle}>Password set!</Text>
        <Text style={styles.doneSub}>
          You can now sign in with your email and password, or continue using magic links.
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Set a password so you can sign in without a magic link. You can always update it later.
        </Text>

        <Text style={styles.label}>New Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            placeholderTextColor={C.SUBTLE}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowPassword((v) => !v)}>
            <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
          </TouchableOpacity>
        </View>
        {tooShort && (
          <Text style={styles.hint}>Must be at least 8 characters</Text>
        )}

        <Text style={[styles.label, { marginTop: SPACE.LG }]}>Confirm Password</Text>
        <TextInput
          style={[styles.inputStandalone, mismatch && styles.inputError]}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Re-enter password"
          placeholderTextColor={C.SUBTLE}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {mismatch && (
          <Text style={styles.hint}>Passwords don't match</Text>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, !isValid && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!isValid || loading}>
          {loading
            ? <ActivityIndicator color={C.WHITE} />
            : <Text style={styles.saveBtnText}>Save Password</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.BG },
  container: { flex: 1, backgroundColor: C.BG },
  content: { padding: SPACE.LG, paddingTop: SPACE.LG },
  intro: {
    fontSize: FONT.SIZES.MD,
    color: C.MUTED,
    fontFamily: FONT.BODY,
    lineHeight: 22,
    marginBottom: SPACE.XL,
  },
  label: {
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY_SEMIBOLD,
    color: C.CHARCOAL,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACE.SM,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  input: {
    flex: 1,
    padding: SPACE.LG,
    fontSize: FONT.SIZES.MD,
    color: C.INK,
    fontFamily: FONT.BODY,
  },
  inputStandalone: {
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
    padding: SPACE.LG,
    fontSize: FONT.SIZES.MD,
    color: C.INK,
    fontFamily: FONT.BODY,
  },
  inputError: { borderColor: C.DANGER },
  eyeBtn: { paddingHorizontal: SPACE.MD },
  eyeIcon: { fontSize: 18 },
  hint: {
    fontSize: FONT.SIZES.SM,
    color: C.DANGER,
    fontFamily: FONT.BODY,
    marginTop: SPACE.XS,
    marginBottom: SPACE.SM,
  },
  saveBtn: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    alignItems: 'center',
    marginTop: SPACE.XL,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: {
    color: C.WHITE,
    fontSize: FONT.SIZES.LG,
    fontFamily: FONT.BODY_BOLD,
    fontWeight: '700',
  },
  doneContainer: {
    flex: 1,
    backgroundColor: C.BG,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACE.XL,
    gap: SPACE.MD,
  },
  doneIcon: { fontSize: 56, marginBottom: SPACE.SM },
  doneTitle: {
    fontSize: FONT.SIZES.XXL,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.INK,
  },
  doneSub: {
    fontSize: FONT.SIZES.MD,
    color: C.MUTED,
    fontFamily: FONT.BODY,
    textAlign: 'center',
    lineHeight: 22,
  },
  doneBtn: {
    marginTop: SPACE.LG,
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    paddingVertical: SPACE.MD,
    paddingHorizontal: SPACE.XXL,
  },
  doneBtnText: {
    color: C.WHITE,
    fontSize: FONT.SIZES.MD,
    fontFamily: FONT.BODY_SEMIBOLD,
  },
});
