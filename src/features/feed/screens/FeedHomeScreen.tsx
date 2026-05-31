import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

// Placeholder until real data is wired
const MOCK_THREADS = [
  { id: '1', senderName: 'alex', videoTitle: 'Funniest dog compilation 2024', thumbnail: null, reactionCount: 3, pending: false },
  { id: '2', senderName: 'maya', videoTitle: 'This pasta recipe changed my life', thumbnail: null, reactionCount: 0, pending: true },
];

export default function FeedHomeScreen({ navigation }: FeedStackScreenProps<'FeedHome'>) {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>reaxn</Text>
      <FlatList
        data={MOCK_THREADS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Thread', { threadId: item.id })}>
            <View style={styles.thumbnail}>
              <Text style={styles.thumbnailIcon}>▶</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.sender}>{item.senderName}</Text>
              <Text style={styles.title} numberOfLines={2}>{item.videoTitle}</Text>
              <Text style={styles.meta}>
                {item.pending ? '⏳ waiting for you' : `${item.reactionCount} reaction${item.reactionCount !== 1 ? 's' : ''}`}
              </Text>
            </View>
            {item.pending && <View style={styles.dot} />}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  header: {
    fontSize: FONT.SIZES.XXL,
    fontWeight: '800',
    color: C.ACCENT,
    letterSpacing: -1,
    padding: SPACE.LG,
  },
  list: { padding: SPACE.LG, gap: SPACE.MD },
  card: {
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.LG,
    flexDirection: 'row',
    padding: SPACE.MD,
    gap: SPACE.MD,
    alignItems: 'center',
  },
  thumbnail: {
    width: 72,
    height: 72,
    backgroundColor: C.SURFACE_2,
    borderRadius: RADIUS.MD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailIcon: { fontSize: 24 },
  info: { flex: 1 },
  sender: { fontSize: FONT.SIZES.SM, color: C.MUTED, marginBottom: 2 },
  title: { fontSize: FONT.SIZES.MD, fontWeight: '600', color: C.INK, marginBottom: 4 },
  meta: { fontSize: FONT.SIZES.SM, color: C.MUTED },
  dot: {
    width: 10,
    height: 10,
    borderRadius: RADIUS.FULL,
    backgroundColor: C.ACCENT,
  },
});
