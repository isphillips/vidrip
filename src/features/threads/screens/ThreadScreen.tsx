import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

export default function ThreadScreen({ route, navigation }: FeedStackScreenProps<'Thread'>) {
  const { threadId } = route.params;

  return (
    <ScrollView style={styles.container}>
      {/* YouTube Short embed placeholder */}
      <View style={styles.player}>
        <Text style={styles.playerIcon}>▶</Text>
        <Text style={styles.playerLabel}>YouTube Short</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.reactButton}
          onPress={() =>
            navigation.getParent()?.navigate('RecordReaction', {
              threadId,
              videoId: 'placeholder',
            })
          }>
          <Text style={styles.reactButtonText}>react 🎬</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>reactions</Text>
      <View style={styles.empty}>
        <Text style={styles.emptyText}>no reactions yet — be the first</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  player: {
    height: 400,
    backgroundColor: C.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.SM,
  },
  playerIcon: { fontSize: 48 },
  playerLabel: { fontSize: FONT.SIZES.MD, color: C.MUTED },
  actions: { padding: SPACE.LG },
  reactButton: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    alignItems: 'center',
  },
  reactButtonText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontWeight: '700' },
  sectionTitle: {
    fontSize: FONT.SIZES.LG,
    fontWeight: '700',
    color: C.INK,
    paddingHorizontal: SPACE.LG,
    marginBottom: SPACE.MD,
  },
  empty: { padding: SPACE.XL, alignItems: 'center' },
  emptyText: { color: C.MUTED, fontSize: FONT.SIZES.MD },
});
