import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import ScreenGradient from '../../../components/ScreenGradient';
import { useAuthStore } from '../../../store/authStore';
import { sendFriendRequest } from '../../../infrastructure/supabase/queries/friends';
import SlimeFriend from '../components/SlimeFriend';
import GradientButton from '../../studio/components/GradientButton';
import ModalCloseButton from '../../../components/ModalCloseButton';
import type { FriendsStackScreenProps } from '../../../app/navigation/types';

export default function AddFriendScreen({ navigation }: FriendsStackScreenProps<'AddFriend'>) {
  const { user } = useAuthStore();
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);

  // Scroll the input into view when focused (instead of auto-popping the keyboard over
  // Drippy on mount). Delay lets the keyboard + KeyboardAvoidingView settle first.
  const scrollRef = useRef<ScrollView>(null);
  const focusScroll = () => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 180); };

  const handleAdd = async () => {
    if (!user || !handle.trim()) return;
    setLoading(true);
    try {
      await sendFriendRequest(user.id, handle.trim());
      Alert.alert('Request sent!', `@${handle.trim().toLowerCase()} will see your request.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not send request. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const trimmedHandle = handle.trim().toLowerCase();
  const isValid = trimmedHandle.length >= 3;

  return (
    <ScreenGradient>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ModalCloseButton />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <SlimeFriend />
        <Text style={styles.title}>Add a Friend</Text>
        <Text style={styles.subtitle}>Enter their handle and Drippy will pass along your request.</Text>
        <View style={styles.inputRow}>
          <Text style={styles.at}>@</Text>
          <TextInput
            style={styles.input}
            value={handle}
            onChangeText={setHandle}
            placeholder="theirhandle"
            placeholderTextColor={C.SUBTLE}
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={focusScroll}
          />
        </View>
        <GradientButton
          label="Send Request"
          icon="person-add"
          onPress={handleAdd}
          disabled={!isValid}
          loading={loading}
          style={styles.cta}
        />
      </ScrollView>
    </KeyboardAvoidingView>
    </ScreenGradient>
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
    fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD,
    fontWeight: '700', color: C.INK, marginBottom: SPACE.XS, textAlign: 'center',
    marginTop: SPACE.XXL
  },
  subtitle: {
    fontSize: FONT.SIZES.MD, color: C.MUTED, marginBottom: SPACE.XL,
    textAlign: 'center', lineHeight: 22,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
    marginBottom: SPACE.LG,
    paddingHorizontal: SPACE.LG,
  },
  at: { fontSize: FONT.SIZES.LG, color: C.MUTED, marginRight: SPACE.XS },
  input: {
    flex: 1,
    padding: SPACE.LG,
    paddingLeft: 0,
    fontSize: FONT.SIZES.LG,
    color: C.INK,
  },
  cta: { marginTop: SPACE.SM },
});
