import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, RADIUS } from '../theme';

// Compact view-count pill (eye outline + count) for the corner of a video thumbnail.
// View counts are recorded unique-per-viewer-per-day (see record_view / migration 0011).
export function formatViews(n: number): string {
  if (n < 1000) { return `${n}`; }
  if (n < 1_000_000) { return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`.replace('.0K', 'K'); }
  return `${(n / 1_000_000).toFixed(1)}M`.replace('.0M', 'M');
}

export default function ViewBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (!count || count <= 0) { return null; }
  return (
    <View style={[styles.badge, style]} pointerEvents="none">
      <Ionicons name="eye-outline" size={12} color={C.WHITE} />
      <Text style={styles.txt}>{formatViews(count)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: RADIUS.SM,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  txt: { color: C.WHITE, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_SEMIBOLD },
});
