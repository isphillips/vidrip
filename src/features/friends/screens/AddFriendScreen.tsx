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
import { useAuthStore } from '../../../store/authStore';
import { sendFriendRequest } from '../../../infrastructure/supabase/queries/friends';
import type { FriendsStackScreenProps } from '../../../app/navigation/types';

export default function AddFriendScreen({ navigation }: FriendsStackScreenProps<'AddFriend'>) {
  const { user } = useAuthStore();
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.title}>Add a Friend</Text>
      <Text style={styles.subtitle}>Enter their handle to send a friend request</Text>
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
          autoFocus
        />
      </View>
      <TouchableOpacity
        style={[styles.button, (!isValid || loading) && styles.buttonDisabled]}
        onPress={handleAdd}
        disabled={!isValid || loading}>
        {loading ? (
          <ActivityIndicator color={C.WHITE} />
        ) : (
          <Text style={styles.buttonText}>Send Request</Text>
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
  title: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD,
    fontWeight: '700', color: C.INK, marginBottom: SPACE.XS },
  subtitle: { fontSize: FONT.SIZES.MD, color: C.MUTED, marginBottom: SPACE.XXL },
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
  button: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD,
    fontWeight: '700' },
});
