import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { fetchFeedThreads, type FeedThread } from '../../../infrastructure/supabase/queries/threads';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

export default function FeedHomeScreen({ navigation }: FeedStackScreenProps<'FeedHome'>) {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [threads, setThreads] = useState<FeedThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchFeedThreads(user.id);
      setThreads(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.header, { marginTop: top }]}>Reaxn</Text>
      <FlatList
        data={threads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={threads.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.ACCENT} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptySubtitle}>Share a Short with a friend to get started</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isPending = item.my_status === 'pending';
          const isSender = item.sender_id === user?.id;
          const senderLabel = isSender ? 'you' : (item.sender?.handle ?? '?');

          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Thread', { threadId: item.id })}>
              <View style={styles.thumbnail}>
                {item.video_thumbnail ? (
                  <Image source={{ uri: item.video_thumbnail }} style={styles.thumbnailImage} />
                ) : (
                  <Text style={styles.thumbnailIcon}>▶</Text>
                )}
              </View>
              <View style={styles.info}>
                <Text style={styles.sender}>{senderLabel}</Text>
                <Text style={styles.title} numberOfLines={2}>
                  {item.video_title ?? item.video_id}
                </Text>
                <Text style={styles.meta}>
                  {isPending
                    ? '👀 Waiting for your reaction'
                    : `${item.reaction_count} reaction${item.reaction_count !== 1 ? 's' : ''}`}
                </Text>
              </View>
              {isPending && <View style={styles.dot} />}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  center: { flex: 1, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center' },
  header: {
    fontSize: FONT.SIZES.XXL,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.ACCENT,
    letterSpacing: -1,
    padding: SPACE.LG,
    marginTop: 0,
  },
  list: { padding: SPACE.LG, gap: SPACE.MD },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: SPACE.XL, gap: SPACE.SM },
  emptyTitle: { fontSize: FONT.SIZES.LG, fontWeight: '700', color: C.INK },
  emptySubtitle: { fontSize: FONT.SIZES.MD, color: C.MUTED, textAlign: 'center' },
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
    overflow: 'hidden',
  },
  thumbnailImage: { width: 72, height: 72 },
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
