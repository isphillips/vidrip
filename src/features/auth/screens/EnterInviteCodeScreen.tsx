import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import type { AuthStackScreenProps } from '../../../app/navigation/types';

export default function EnterInviteCodeScreen({
  navigation,
}: AuthStackScreenProps<'EnterInviteCode'>) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangeText = (text: string) => {
    // Strip everything except letters/digits, uppercase
    const clean = text.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    // Auto-insert dash after first 5 chars (REAXN-)
    if (clean.length <= 5) {
      setCode(clean);
    } else {
      setCode(`${clean.slice(0, 5)}-${clean.slice(5, 9)}`);
    }
  };

  const handleSubmit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invite_codes')
        .select('*')
        .eq('code', trimmed)
        .is('used_by', null)
        .single();

      if (error || !data) {
        Alert.alert('Invalid Code', 'This invite code is invalid or has already been used.');
        return;
      }
      navigation.navigate('CreateProfile', { inviteCode: trimmed });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter your invite code</Text>
      <Text style={styles.subtitle}>Reaxn is invite only. Get a code from a friend.</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={handleChangeText}
        placeholder="XXXXX-XXXX"
        placeholderTextColor={C.SUBTLE}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={10}
        spellCheck={false}
      />
      <TouchableOpacity
        style={[styles.button, (!code.trim() || loading) && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!code.trim() || loading}>
        {loading ? (
          <ActivityIndicator color={C.WHITE} />
        ) : (
          <Text style={styles.buttonText}>Continue</Text>
        )}
      </TouchableOpacity>
    </View>
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
    marginBottom: SPACE.SM,
  },
  subtitle: {
    fontSize: FONT.SIZES.MD,
    color: C.MUTED,
    marginBottom: SPACE.XXL,
  },
  input: {
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
    padding: SPACE.LG,
    fontSize: FONT.SIZES.XL,
    fontWeight: '700',
    color: C.INK,
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: SPACE.LG,
  },
  button: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    alignItems: 'center',
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
