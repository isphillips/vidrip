import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Image, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl, Switch,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import {
  fetchChannelReviews,
  fetchChannelReviewSettings,
  setChannelReviewsEnabled,
  type ChannelReview,
} from '../../../infrastructure/supabase/queries/channels';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

// Creator-facing inbox: every review clip across the channel, newest first.
// (For non-creators, RLS limits this to their own submitted reviews.)
export default function ChannelReviewsScreen({
  route, navigation,
}: ChannelsStackScreenProps<'ChannelReviews'>) {
  const { channelId, channelName } = route.params;
  const { top } = useSafeAreaInsets();

  const [reviews, setReviews] = useState<ChannelReview[]>([]);
  const [visible, setVisible] = useState(false);
  const [savingVisible, setSavingVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); }
    try {
      const [data, settings] = await Promise.all([
        fetchChannelReviews(channelId),
        fetchChannelReviewSettings(channelId),
      ]);
      setReviews(data);
      setVisible(settings.reviewsEnabled);
    } catch { /* swallow */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [channelId]);

  const toggleVisible = useCallback(async (next: boolean) => {
    setVisible(next);            // optimistic
    setSavingVisible(true);
    try {
      await setChannelReviewsEnabled(channelId, next);
    } catch {
      setVisible(!next);         // revert
    } finally {
      setSavingVisible(false);
    }
  }, [channelId]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const thumbFor = (r: ChannelReview): string | null =>
    r.post_yt_video_thumbnail ??
    (r.post_source_type === 'youtube' && r.post_yt_video_id
      ? `https://img.youtube.com/vi/${r.post_yt_video_id}/hqdefault.jpg`
      : null);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: top + SPACE.SM }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Reviews · {channelName}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Visibility toggle — off keeps reviews in this private inbox only */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Show reviews to the channel</Text>
          <Text style={styles.toggleSub}>
            {visible
              ? 'Members can see a Reviews tab on each post.'
              : 'Reviews are private to you until turned on.'}
          </Text>
        </View>
        <Switch
          value={visible}
          onValueChange={toggleVisible}
          disabled={savingVisible}
          trackColor={{ true: C.ACCENT, false: C.SURFACE_2 }}
          thumbColor={C.WHITE}
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} /></View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={r => r.id}
          contentContainerStyle={reviews.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.ACCENT_HOT} />
          }
          ListEmptyComponent={
            <View style={styles.center}><Text style={styles.emptyText}>No reviews yet</Text></View>
          }
          renderItem={({ item }) => {
            const thumb = thumbFor(item);
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('WatchReview', { reviewId: item.id })}>
                <View style={styles.thumb}>
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <Text style={styles.thumbIcon}>▶</Text>
                  )}
                  <View style={styles.playBadge}><Text style={styles.playBadgeIcon}>▶</Text></View>
                </View>
                <View style={styles.info}>
                  <Text style={styles.handle}>@{item.reviewer?.handle ?? '?'}</Text>
                  <Text style={styles.videoTitle} numberOfLines={1}>
                    {item.post_yt_video_title ?? 'Video'}
                  </Text>
                  {item.duration ? (
                    <Text style={styles.duration}>{item.duration}s review</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.MD, paddingBottom: SPACE.MD,
    borderBottomWidth: 1, borderBottomColor: C.BORDER, gap: SPACE.SM,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 28, color: C.INK, lineHeight: 32, fontFamily: FONT.BODY },
  title: { flex: 1, fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  toggleInfo: { flex: 1, gap: 2 },
  toggleLabel: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM, color: C.INK },
  toggleSub: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, color: C.MUTED },
  list: { padding: SPACE.LG, gap: SPACE.MD },
  emptyText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD },
  thumb: {
    width: 64, height: 64, borderRadius: RADIUS.MD,
    backgroundColor: C.SURFACE_2, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  thumbIcon: { fontSize: 20, color: C.SUBTLE },
  playBadge: {
    position: 'absolute', width: 26, height: 26, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  playBadgeIcon: { color: C.WHITE, fontSize: 11, marginLeft: 2 },
  info: { flex: 1, gap: 2 },
  handle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  videoTitle: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED },
  duration: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, color: C.SUBTLE },
});
