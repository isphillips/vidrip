import React from 'react';
import { TouchableOpacity, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C } from '../../../theme';

// Global "Messages" (private chats) entry. Navigates cross-stack into the Channels
// stack's PrivateChats screen, so it works from any main screen's header.
export default function MailboxButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const nav = useNavigation<any>();
  return (
    <TouchableOpacity
      style={[styles.btn, style]} hitSlop={10} activeOpacity={0.7}
      onPress={() => nav.navigate('Messages')}>
      <Ionicons name="mail-outline" size={22} color={C.ACCENT_HOT} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER,
  },
});
