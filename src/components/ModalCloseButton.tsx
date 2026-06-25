import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, SPACE, RADIUS } from '../theme';

// Floating top-right close (X) for screens presented as modals (no native back button). Hidden when
// there's nothing to dismiss (e.g. a screen sitting as a tab root), so the same screen can serve both.
export default function ModalCloseButton() {
  const navigation = useNavigation<any>();
  const { top } = useSafeAreaInsets();
  if (!navigation.canGoBack?.()) { return null; }
  return (
    <TouchableOpacity
      style={[styles.btn, { top: SPACE.XXL }]}
      hitSlop={10}
      activeOpacity={0.7}
      onPress={() => navigation.goBack()}
      accessibilityRole="button"
      accessibilityLabel="Close">
      <Ionicons name="close" size={22} color={C.INK} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute', right: SPACE.LG, zIndex: 50,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: C.SURFACE, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.BORDER,
  },
});
