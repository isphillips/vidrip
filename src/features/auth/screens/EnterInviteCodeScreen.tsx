import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, interpolate } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import { CopyScrim, TEXT_GLOW } from '../../../components/scene/sceneKit';
import { AuthScene } from '../components/AuthScene';
import GradientButton from '../../studio/components/GradientButton';
import { useShareIntentStore } from '../../../store/shareIntentStore';
import type { AuthStackScreenProps } from '../../../app/navigation/types';

export default function EnterInviteCodeScreen({
  navigation, route,
}: AuthStackScreenProps<'EnterInviteCode'>) {
  const { top, bottom } = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  // Unmount the sceneKit world when unfocused so it doesn't bleed onto pushed screens (the AuthStack's
  // cross-fade keeps prior screens composited). Same dusk root bg → no flash. (See WelcomeScreen.)
  const focused = useIsFocused();

  const enter = useSharedValue(0);
  useEffect(() => { enter.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }); }, [enter]);
  const formStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: interpolate(enter.value, [0, 1], [0.92, 1]) }],
  }));

  const handleChangeText = (text: string) => {
    const clean = text.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (clean.length <= 5) { setCode(clean); }
    else { setCode(`${clean.slice(0, 5)}-${clean.slice(5, 9)}`); }
  };

  // Prefill from the nav param, or from a vidrip://invite?code= deep link (web registration).
  const pendingInvite = useShareIntentStore(s => s.pendingInviteCode);
  const prefill = route.params?.code ?? pendingInvite ?? undefined;
  useEffect(() => {
    if (prefill) {
      handleChangeText(prefill);
      if (pendingInvite) { useShareIntentStore.getState().setPendingInviteCode(null); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const handleSubmit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { return; }
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
    <View style={styles.root}>
      {focused && <AuthScene gated enter={enter} />}

      <TouchableOpacity style={[styles.back, { top: top + SPACE.SM }]} onPress={() => navigation.goBack()} hitSlop={12} activeOpacity={0.75}>
        <Ionicons name="chevron-back" size={22} color={C.INK} />
      </TouchableOpacity>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: bottom + SPACE.XL }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.card, formStyle]}>
            <CopyScrim style={styles.cardScrim} />
            <Text style={styles.title}>Enter your invite code</Text>
            <Text style={styles.subtitle}>Vidrip is invite-only. Drippy's guarding the gate. Enter your code for exclusive access.</Text>
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
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#160826', overflow: 'hidden' },
  flex: { flex: 1 },
  back: {
    position: 'absolute', left: SPACE.LG, zIndex: 10,
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(10,4,20,0.5)',
    borderWidth: 1, borderColor: C.BORDER, alignItems: 'center', justifyContent: 'center',
  },
  scroll: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: SPACE.XL },
  card: { alignItems: 'center', alignSelf: 'stretch', gap: SPACE.MD, paddingVertical: SPACE.LG },
  cardScrim: { left: -SPACE.XL, right: -SPACE.XL, top: -SPACE.MD, bottom: -SPACE.XXL },
  title: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD, fontWeight: '700', color: C.WHITE, textAlign: 'center', ...TEXT_GLOW },
  subtitle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.INK, textAlign: 'center', lineHeight: 22, maxWidth: 320, ...TEXT_GLOW },
  input: {
    alignSelf: 'stretch', backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    padding: SPACE.LG, fontSize: FONT.SIZES.XL, fontWeight: '700', color: C.INK, textAlign: 'center', marginTop: SPACE.SM,
  },
  cta: { alignSelf: 'stretch', marginTop: SPACE.XS },
});
