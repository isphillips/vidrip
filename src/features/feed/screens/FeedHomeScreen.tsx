import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Animated,
  ScrollView,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { useFeedStore } from '../../../store/feedStore';
import { fetchFeedThreads, type FeedThread } from '../../../infrastructure/supabase/queries/threads';
import { fetchMyReviews, type ChannelReview } from '../../../infrastructure/supabase/queries/channels';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

const FAVS_KEY = 'vidrip_favorites';
const HIDDEN_KEY = 'vidrip_hidden_threads';
const ACTION_WIDTH = 120; // 2 × 60

type Tab = 'feed' | 'favorites';
type Filter = 'all' | 'toreact' | 'reactions' | 'requests' | 'reviews';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'toreact', label: 'To React' },
  { key: 'reactions', label: 'My Reactions' },
  { key: 'requests', label: 'My Requests' },
  { key: 'reviews', label: 'My Reviews' },
];
// A thread "needs your reaction" if a friend sent it and you haven't reacted.
const needsReaction = (t: FeedThread, uid?: string) =>
  t.sender_id !== uid && t.my_status !== 'reacted';

// ── Action button: scale bounce + white→red (or red→white for remove) ────────
function ActionBtn({
  iconName, onPress,
  defaultColor = '#FFFFFF',
  pressedColor = '#FF3B30',
}: {
  iconName: string;
  onPress: () => void;
  defaultColor?: string;
  pressedColor?: string;
}) {
  const [active, setActive] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    setActive(true);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.72, duration: 90, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start(() => { setActive(false); onPress(); });
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={1} style={styles.actionBtn}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={iconName} size={22} color={active ? pressedColor : defaultColor} />
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function FeedHomeScreen({ navigation }: FeedStackScreenProps<'FeedHome'>) {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [threads, setThreads]     = useState<FeedThread[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]             = useState<Tab>('feed');
  const [filter, setFilter]       = useState<Filter>('all');
  const [favs, setFavs]           = useState<Map<string, number>>(new Map()); // id → addedAt ms
  const [hidden, setHidden]       = useState<Set<string>>(new Set());
  const [myReviews, setMyReviews] = useState<ChannelReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  const swipeRefs = useRef<Map<string, Swipeable | null>>(new Map());

  // ── Persist helpers ─────────────────────────────────────────────────────────
  const persistFavs = (next: Map<string, number>) =>
    AsyncStorage.setItem(FAVS_KEY, JSON.stringify([...next.entries()])).catch(() => {});

  const persistHidden = (next: Set<string>) =>
    AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify([...next])).catch(() => {});

  // ── Load persisted state on mount ───────────────────────────────────────────
  useEffect(() => {
    Promise.all([AsyncStorage.getItem(FAVS_KEY), AsyncStorage.getItem(HIDDEN_KEY)])
      .then(([f, h]) => {
        if (f) setFavs(new Map(JSON.parse(f) as [string, number][]));
        if (h) setHidden(new Set(JSON.parse(h) as string[]));
      })
      .catch(() => {});
  }, []);

  // ── Fetch threads ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user) return;
    try { setThreads(await fetchFeedThreads(user.id)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Lazily load the user's submitted reviews when the My Reviews pill is active.
  const loadReviews = useCallback(async () => {
    if (!user) return;
    setReviewsLoading(true);
    try { setMyReviews(await fetchMyReviews(user.id)); }
    catch { /* swallow */ }
    finally { setReviewsLoading(false); }
  }, [user]);

  useEffect(() => { if (filter === 'reviews') { loadReviews(); } }, [filter, loadReviews]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const addFav = (id: string) => {
    setFavs(prev => { const n = new Map(prev); n.set(id, Date.now()); persistFavs(n); return n; });
    swipeRefs.current.get(id)?.close();
  };

  const removeFav = (id: string) => {
    setFavs(prev => { const n = new Map(prev); n.delete(id); persistFavs(n); return n; });
    swipeRefs.current.get(id)?.close();
  };

  const hideThread = (id: string) => {
    setHidden(prev => { const n = new Set(prev); n.add(id); persistHidden(n); return n; });
  };

  const closeOthers = (openId: string) =>
    swipeRefs.current.forEach((ref, id) => { if (id !== openId) ref?.close(); });

  // ── Computed list ────────────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = threads.filter(t => !hidden.has(t.id));
    // Sub-filter pills: My Reactions = ones I reacted to; My Requests = ones I sent.
    if (filter === 'toreact') { list = list.filter(t => needsReaction(t, user?.id)); }
    else if (filter === 'reactions') { list = list.filter(t => t.my_status === 'reacted'); }
    else if (filter === 'requests') { list = list.filter(t => t.sender_id === user?.id); }
    if (tab === 'favorites') {
      list = list.filter(t => favs.has(t.id));
      list.sort((a, b) => (favs.get(b.id) ?? 0) - (favs.get(a.id) ?? 0));
    } else {
      list = list.filter(t => !favs.has(t.id));
      // stable sort: unreacted first, preserve original order within each group
      list = list
        .map((t, i) => ({ t, i }))
        .sort((a, b) => {
          const au = a.t.sender_id !== user?.id && a.t.my_status !== 'reacted' ? 0 : 1;
          const bu = b.t.sender_id !== user?.id && b.t.my_status !== 'reacted' ? 0 : 1;
          return au !== bu ? au - bu : a.i - b.i;
        })
        .map(({ t }) => t);
    }
    return list;
  }, [threads, hidden, favs, tab, filter, user?.id]);

  // Pill counts (over non-hidden threads) + drive the Feed tab-bar badge.
  const counts = useMemo(() => {
    const visible = threads.filter(t => !hidden.has(t.id));
    return {
      toreact: visible.filter(t => needsReaction(t, user?.id)).length,
      reactions: visible.filter(t => t.my_status === 'reacted').length,
      requests: visible.filter(t => t.sender_id === user?.id).length,
    } as Record<Filter, number>;
  }, [threads, hidden, user?.id]);

  const setToReactCount = useFeedStore(s => s.setToReactCount);
  useEffect(() => { setToReactCount(counts.toreact); }, [counts.toreact, setToReactCount]);

  // ── Swipe actions ────────────────────────────────────────────────────────────
  const renderRightActions = (
    item: FeedThread,
    prog: Animated.AnimatedInterpolation<number>,
  ) => {
    const opacity = prog.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.6, 1], extrapolate: 'clamp' });
    const isFav = favs.has(item.id);
    return (
      <Animated.View style={[styles.actionsWrap, { opacity }]}>
        {tab === 'feed' ? (
          <ActionBtn
            iconName={isFav ? 'heart' : 'heart-outline'}
            defaultColor={isFav ? '#FF3B30' : '#FFFFFF'}
            pressedColor={isFav ? '#FFFFFF' : '#FF3B30'}
            onPress={() => isFav ? removeFav(item.id) : addFav(item.id)}
          />
        ) : (
          <ActionBtn
            iconName="heart"
            defaultColor="#FF3B30"
            pressedColor="#FFFFFF"
            onPress={() => removeFav(item.id)}
          />
        )}
        <ActionBtn iconName="trash-outline" onPress={() => hideThread(item.id)} />
      </Animated.View>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.ACCENT} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={{ marginTop: top }}>
        <View style={styles.header}>
          <Image source={require('../../../assets/goldlogo.png')} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.headerTitle}>Vidrip</Text>
        </View>
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'feed' && styles.tabBtnActive]}
            onPress={() => setTab('feed')} activeOpacity={0.8}>
            <Text style={[styles.tabLabel, tab === 'feed' && styles.tabLabelActive]}>Feed</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'favorites' && styles.tabBtnActive]}
            onPress={() => setTab('favorites')} activeOpacity={0.8}>
            <Text style={[styles.tabLabel, tab === 'favorites' && styles.tabLabelActive]}>Favorites</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}>
          {FILTERS.map(f => {
            const active = filter === f.key;
            const n = f.key === 'reviews' ? myReviews.length
              : f.key === 'all' ? 0 : counts[f.key];
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.8}>
                <Text style={[styles.pillTxt, active && styles.pillTxtActive]}>{f.label}</Text>
                {n > 0 && (
                  <View style={[styles.pillCount, active && styles.pillCountActive]}>
                    <Text style={styles.pillCountTxt}>{n}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {filter === 'reviews' ? (
        <FlatList
          data={myReviews}
          keyExtractor={item => item.id}
          contentContainerStyle={myReviews.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={<RefreshControl refreshing={reviewsLoading} onRefresh={loadReviews} tintColor={C.ACCENT} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No reviews yet</Text>
              <Text style={styles.emptySubtitle}>
                Record a review after reacting to a channel post — they show up here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const thumb = item.post_yt_video_thumbnail
              ?? (item.post_source_type === 'youtube' && item.post_yt_video_id
                ? `https://img.youtube.com/vi/${item.post_yt_video_id}/hqdefault.jpg`
                : null);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('WatchReview', { reviewId: item.id })}>
                <View style={styles.thumbnail}>
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={styles.thumbnailImage} />
                  ) : (
                    <Text style={styles.thumbnailIcon}>★</Text>
                  )}
                </View>
                <View style={styles.info}>
                  <Text style={styles.sender} numberOfLines={1}>{item.channel_name ?? 'Channel'}</Text>
                  <Text style={styles.title} numberOfLines={2}>
                    {item.post_yt_video_title ?? 'Video'}
                  </Text>
                  <Text style={styles.meta}>
                    ★ {item.duration ? `${item.duration}s review` : 'Review'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : (
      <FlatList
        data={displayed}
        keyExtractor={item => item.id}
        contentContainerStyle={displayed.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.ACCENT} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {tab === 'favorites' ? 'No favorites yet' : 'Nothing here yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {tab === 'favorites'
                ? 'Swipe left on any thread to favorite it'
                : 'Share a Short with a friend to get started'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isPending  = item.my_status === 'pending';
          const isSender   = item.sender_id === user?.id;
          const unreacted  = !isSender && item.my_status !== 'reacted';
          const isFav      = favs.has(item.id);
          const label      = isSender ? 'you' : (item.sender?.handle ?? '?');

          return (
            <Swipeable
              ref={ref => swipeRefs.current.set(item.id, ref)}
              friction={2}
              rightThreshold={40}
              overshootRight={false}
              renderRightActions={prog => renderRightActions(item, prog)}
              onSwipeableWillOpen={() => closeOthers(item.id)}
              containerStyle={styles.swipeContainer}
            >
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('Thread', { threadId: item.id })}>
                <View style={styles.thumbnail}>
                  {unreacted ? (
                    <View style={styles.thumbnailBlind}>
                      <Text style={styles.thumbnailBlindIcon}>?</Text>
                    </View>
                  ) : item.video_thumbnail ? (
                    <Image source={{ uri: item.video_thumbnail }} style={styles.thumbnailImage} />
                  ) : (
                    <Text style={styles.thumbnailIcon}>▶</Text>
                  )}
                  {isFav && (
                    <View style={styles.favDot}>
                      <Ionicons name="heart" size={9} color="#FF3B30" />
                    </View>
                  )}
                </View>
                <View style={styles.info}>
                  <Text style={styles.sender}>{label}</Text>
                  <Text style={styles.title} numberOfLines={2}>
                    {unreacted
                      ? `${item.sender?.handle ?? 'Someone'} requested your reaction`
                      : (item.video_title ?? item.video_id)}
                  </Text>
                  <Text style={styles.meta}>
                    {unreacted
                      ? '👀 Tap to react'
                      : `${item.reaction_count} reaction${item.reaction_count !== 1 ? 's' : ''}`}
                  </Text>
                </View>
                {isPending && <View style={styles.dot} />}
              </TouchableOpacity>
            </Swipeable>
          );
        }}
      />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.BG },
  center:     { flex: 1, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.SM,
    paddingHorizontal: SPACE.LG,
    paddingTop: SPACE.LG,
    paddingBottom: SPACE.SM,
  },
  headerLogo: { width: 34, height: 37 },
  headerTitle: {
    fontSize: FONT.SIZES.XXL,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.INK,
    letterSpacing: -1,
  },

  // Tab toggle
  // Mirrors the Browse/Paste Link segmented toggle on the Share screen.
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: SPACE.LG,
    marginVertical: SPACE.XS,
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    padding: 3,
    gap: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: SPACE.SM,
    alignItems: 'center',
    borderRadius: RADIUS.SM,
  },
  tabBtnActive:   { backgroundColor: C.ACCENT },
  tabLabel:       { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  tabLabelActive: { color: C.WHITE },
  filterRow: { gap: SPACE.SM, paddingHorizontal: SPACE.LG, marginTop: SPACE.SM, marginBottom: SPACE.XS, alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACE.MD, paddingVertical: 6, borderRadius: RADIUS.FULL,
    backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER,
  },
  pillActive: { backgroundColor: C.ACCENT_LITE, borderColor: C.ACCENT },
  pillTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  pillTxtActive: { color: C.ACCENT_HOT },
  pillCount: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: C.ACCENT, alignItems: 'center', justifyContent: 'center',
  },
  pillCountActive: { backgroundColor: C.ACCENT_HOT },
  pillCountTxt: { fontSize: 11, fontFamily: FONT.BODY_BOLD, color: C.WHITE, marginTop: -2 },

  list:           { paddingHorizontal: SPACE.LG, paddingTop: SPACE.MD, paddingBottom: SPACE.LG, gap: SPACE.MD },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty:          { alignItems: 'center', padding: SPACE.XL, gap: SPACE.SM },
  emptyTitle:     { fontSize: FONT.SIZES.LG, fontWeight: '700', color: C.INK },
  emptySubtitle:  { fontSize: FONT.SIZES.MD, color: C.MUTED, textAlign: 'center' },

  swipeContainer: { borderRadius: RADIUS.LG, overflow: 'hidden' },

  card: {
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.LG,
    flexDirection: 'row',
    padding: SPACE.MD,
    gap: SPACE.MD,
    alignItems: 'center',
  },

  thumbnail: {
    width: 72, height: 72,
    backgroundColor: C.SURFACE_2,
    borderRadius: RADIUS.MD,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnailImage:     { width: 72, height: 72 },
  thumbnailIcon:      { fontSize: 24 },
  thumbnailBlind:     { width: 72, height: 72, backgroundColor: C.BLACK, alignItems: 'center', justifyContent: 'center' },
  thumbnailBlindIcon: { fontSize: 28, color: 'rgba(255,255,255,0.4)', fontWeight: '700' },
  favDot: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: RADIUS.FULL,
    width: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
  },

  info:   { flex: 1 },
  sender: { fontSize: FONT.SIZES.SM, color: C.MUTED, marginBottom: 2 },
  title:  { fontSize: FONT.SIZES.MD, fontWeight: '600', color: C.INK, marginBottom: 4 },
  meta:   { fontSize: FONT.SIZES.SM, color: C.MUTED },
  dot:    { width: 10, height: 10, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT },

  // Swipe actions
  actionsWrap: {
    width: ACTION_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: RADIUS.LG,
    marginLeft: SPACE.SM,
  },
  actionBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
