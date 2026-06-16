import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';

/**
 * Top-right "Save for later" pill for the studio editing screens. The draft autosaves
 * continuously, so this just flushes (via the screen unmount) and exits to the studio home,
 * where the clip waits under the Drafts tab.
 */
export default function SaveForLaterButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={10} activeOpacity={0.8} style={styles.btn}>
      <Ionicons name="bookmark-outline" size={13} color={C.INK} />
      <Text style={styles.txt}>Save for later</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACE.SM, paddingVertical: 5, borderRadius: RADIUS.FULL,
    borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE,
  },
  txt: { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.XS },
});
