import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import type { AuthStackScreenProps } from '../../../app/navigation/types';
import SlimeWizard from '../components/SlimeWizard';
import GradientButton from '../../studio/components/GradientButton';

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
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <SlimeWizard />
        <Text style={styles.title}>Enter your invite code</Text>
        <Text style={styles.subtitle}>Vidrip is invite only. Enter your code for exclusive access.</Text>
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
        <GradientButton
          label="Continue"
          icon="sparkles"
          onPress={handleSubmit}
          disabled={!code.trim()}
          loading={loading}
          style={styles.cta}
        />
      </ScrollView>
    </View>
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
    marginBottom: SPACE.SM,
  },
  subtitle: {
    fontSize: FONT.SIZES.MD,
    color: C.MUTED,
    textAlign: 'center',
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
    // No letterSpacing: on iOS it leaks into other TextInputs across the app (RN bug).
    textAlign: 'center',
    marginBottom: SPACE.LG,
  },
  cta: { marginTop: SPACE.SM },
});
