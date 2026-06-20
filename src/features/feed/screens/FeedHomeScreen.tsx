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
  Easing,
  ScrollView,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { useFeedStore } from '../../../store/feedStore';
import { useBlockStore } from '../../../store/blockStore';
import { fetchFeedThreads, fetchMyReactions, type FeedThread, type MyReaction } from '../../../infrastructure/supabase/queries/threads';
import {
  fetchMyReviews, fetchChannelsToReact, fetchMyChannelReactions,
  type ChannelReview, type ChannelToReact, type MyChannelReaction,
} from '../../../infrastructure/supabase/queries/channels';
import MailboxButton from '../../channels/components/MailboxButton';
import ExclusiveRail from '../../exclusive/components/ExclusiveRail';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

const questionmark = require('../../../assets/questionmark.png');

const FAVS_KEY = 'vidrip_favorites';
const HIDDEN_KEY = 'vidrip_hidden_threads';

type Tab = 'feed' | 'favorites';
type Filter = 'all' | 'toreact' | 'channels' | 'reactions' | 'requests' | 'reviews';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'toreact', label: 'Friend Drops' },
  { key: 'channels', label: 'Channel Drops' },
  { key: 'reactions', label: 'My Reactions' },
  { key: 'requests', label: 'My Requests' },
  { key: 'reviews', label: 'My Reviews' },
];

// Favorites are type-agnostic: every entry across every list maps to a stable favKey,
// so a heart in any tab is one unified favorites collection.
const favKeyThread = (id: string) => `thread:${id}`;
const favKeyChannel = (postId: string) => `channel:${postId}`;
const favKeyReaction = (kind: string, id: string) => `reaction:${kind}:${id}`;
const favKeyReview = (id: string) => `review:${id}`;

// Flowing-water wordmark: a pink↔purple gradient slides under a "drip" text mask.
const FLOW_PINK = '#FF4FA3';
const FLOW_PURPLE = '#A05CFF';
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// A thread "needs your reaction" if a friend sent it and you haven't reacted.
const needsReaction = (t: FeedThread, uid?: string) =>
  t.sender_id !== uid && t.my_status !== 'reacted';

// Normalized row used by the unified Favorites tab.
type FavRow = {
  favKey: string;
  addedAt: number;
  thumbnail: string | null;
  blind: boolean;
  title: string;
  subtitle: string;
  meta: string;
  onPress: () => void;
};

// ── Swipe action tile: brand gradient for favorite, dark for delete, scale bounce ──
function SwipeAction({ icon, onPress, variant }: { icon: string; onPress: () => void; variant: 'fav' | 'del' }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.8, duration: 90, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 130, useNativeDriver: true }),
    ]).start(() => onPress());
  };
  return (
    <TouchableOpacity onPress={press} activeOpacity={0.85} style={styles.actionBtn}>
      <Animated.View style={{ transform: [{ scale }] }}>
        {variant === 'fav' ? (
          <LinearGradient colors={[FLOW_PINK, FLOW_PURPLE]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionTile}>
            <Ionicons name={icon} size={22} color="#fff" />
          </LinearGradient>
        ) : (
          <View style={[styles.actionTile, styles.actionTileDel]}>
            <Ionicons name={icon} size={21} color="#fff" />
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── Reusable swipeable row: brand action pane + a persistent slide hint + the
//    top-left favorite heart overlay (so every list gets the same affordances). ──
function SwipeRow({
  favKey, isFav, onToggleFav, onDelete, registerRef, onWillOpen, children,
}: {
  favKey: string;
  isFav: boolean;
  onToggleFav: (favKey: string) => void;
  onDelete?: () => void;
  registerRef: (favKey: string, ref: Swipeable | null) => void;
  onWillOpen: (favKey: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Swipeable
      ref={ref => registerRef(favKey, ref)}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      onSwipeableWillOpen={() => onWillOpen(favKey)}
      containerStyle={styles.swipeContainer}
      renderRightActions={prog => {
        const opacity = prog.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.7, 1], extrapolate: 'clamp' });
        const translateX = prog.interpolate({ inputRange: [0, 1], outputRange: [24, 0], extrapolate: 'clamp' });
        return (
          <Animated.View style={[styles.actionsWrap, { opacity, transform: [{ translateX }] }]}>
            <SwipeAction
              variant="fav"
              icon={isFav ? 'heart' : 'heart-outline'}
              onPress={() => onToggleFav(favKey)}
            />
            {onDelete && <SwipeAction variant="del" icon="trash-outline" onPress={onDelete} />}
          </Animated.View>
        );
      }}>
      <View>
        {children}
        {isFav && (
          <View style={styles.favHeart} pointerEvents="none">
            <Ionicons name="heart" size={11} color="#fff" />
          </View>
        )}
        {/* Slide affordance: a soft left-chevron grip so it's obvious the row pulls open. */}
        <View style={styles.swipeHint} pointerEvents="none">
          <Ionicons name="chevron-back" size={14} color={C.SUBTLE} />
        </View>
      </View>
    </Swipeable>
  );
}

// Presentational card for the unified Favorites tab.
function FavCard({ row }: { row: FavRow }) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={row.onPress}>
      <View style={styles.thumbnail}>
        {row.blind ? (
          <View style={styles.thumbnailBlind}><Image source={questionmark} style={styles.thumbnailBlindImg} resizeMode="contain" /></View>
        ) : row.thumbnail ? (
          <Image source={{ uri: row.thumbnail }} style={styles.thumbnailImage} />
        ) : (
          <Text style={styles.thumbnailIcon}>▶</Text>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.sender} numberOfLines={1}>{row.subtitle}</Text>
        <Text style={styles.title} numberOfLines={2}>{row.title}</Text>
        <Text style={styles.meta}>{row.meta}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function FeedHomeScreen({ navigation }: FeedStackScreenProps<'FeedHome'>) {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const blocked = useBlockStore(s => s.blocked);

  // Flowing "drip" wordmark gradient.
  const [dripSize, setDripSize] = useState({ w: 70, h: 34 });
  const flow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(flow, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [flow]);
  const dripTranslateX = flow.interpolate({ inputRange: [0, 1], outputRange: [0, -dripSize.w] });

  const [threads, setThreads]     = useState<FeedThread[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]             = useState<Tab>('feed');
  const [filter, setFilter]       = useState<Filter>('toreact');
  const [favs, setFavs]           = useState<Map<string, number>>(new Map()); // favKey → addedAt ms
  const [hidden, setHidden]       = useState<Set<string>>(new Set());
  const [myReviews, setMyReviews] = useState<ChannelReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [channelTiles, setChannelTiles] = useState<ChannelToReact[]>([]);
  const [myChannelReactions, setMyChannelReactions] = useState<MyChannelReaction[]>([]);
  const [myReactions, setMyReactions] = useState<MyReaction[]>([]);

  const swipeRefs = useRef<Map<string, Swipeable | null>>(new Map());
  const registerRef = useCallback((key: string, ref: Swipeable | null) => { swipeRefs.current.set(key, ref); }, []);
  const closeOthers = useCallback((openKey: string) =>
    swipeRefs.current.forEach((ref, key) => { if (key !== openKey) ref?.close(); }), []);

  // ── Persist helpers ─────────────────────────────────────────────────────────
  const persistFavs = (next: Map<string, number>) =>
    AsyncStorage.setItem(FAVS_KEY, JSON.stringify([...next.entries()])).catch(() => {});
  const persistHidden = (next: Set<string>) =>
    AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify([...next])).catch(() => {});

  // ── Load persisted state (migrate legacy bare-thread-id favorites → thread:<id>) ──
  useEffect(() => {
    Promise.all([AsyncStorage.getItem(FAVS_KEY), AsyncStorage.getItem(HIDDEN_KEY)])
      .then(([f, h]) => {
        if (f) {
          const entries = (JSON.parse(f) as [string, number][])
            .map(([k, v]) => [k.includes(':') ? k : favKeyThread(k), v] as [string, number]);
          setFavs(new Map(entries));
        }
        if (h) setHidden(new Set(JSON.parse(h) as string[]));
      })
      .catch(() => {});
  }, []);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user) return;
    try { setThreads(await fetchFeedThreads(user.id)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);
  const loadChannels = useCallback(async () => {
    if (!user) return;
    try { setChannelTiles(await fetchChannelsToReact(user.id)); } catch { /* swallow */ }
  }, [user]);
  const loadReviews = useCallback(async () => {
    if (!user) return;
    setReviewsLoading(true);
    try { setMyReviews(await fetchMyReviews(user.id)); }
    catch { /* swallow */ }
    finally { setReviewsLoading(false); }
  }, [user]);
  const loadChannelReactions = useCallback(async () => {
    if (!user) return;
    try { setMyChannelReactions(await fetchMyChannelReactions(user.id)); } catch { /* swallow */ }
  }, [user]);
  const loadMyReactions = useCallback(async () => {
    if (!user) return;
    try { setMyReactions(await fetchMyReactions(user.id)); } catch { /* swallow */ }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); loadChannels(); loadReviews(); loadChannelReactions(); loadMyReactions(); }, [load, loadChannels, loadReviews, loadChannelReactions, loadMyReactions]));
  const refreshAll = useCallback(() => {
    setRefreshing(true);
    Promise.all([load(), loadChannels(), loadReviews(), loadChannelReactions(), loadMyReactions()]).finally(() => setRefreshing(false));
  }, [load, loadChannels, loadReviews, loadChannelReactions, loadMyReactions]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const toggleFav = useCallback((favKey: string) => {
    setFavs(prev => {
      const n = new Map(prev);
      if (n.has(favKey)) { n.delete(favKey); } else { n.set(favKey, Date.now()); }
      persistFavs(n);
      return n;
    });
    swipeRefs.current.get(favKey)?.close();
  }, []);

  const hideThread = useCallback((id: string) => {
    setHidden(prev => { const n = new Set(prev); n.add(id); persistHidden(n); return n; });
    swipeRefs.current.get(favKeyThread(id))?.close();
  }, []);

  // ── Feed-tab friend-thread list (favorites now STAY in the feed) ──────────────
  const displayed = useMemo(() => {
    let list = threads.filter(t => !hidden.has(t.id) && !blocked.has(t.sender_id));
    if (filter === 'toreact') { list = list.filter(t => needsReaction(t, user?.id)); }
    else if (filter === 'reactions') { list = list.filter(t => t.my_status === 'reacted'); }
    else if (filter === 'requests') { list = list.filter(t => t.sender_id === user?.id); }
    // Unreacted first, otherwise preserve order.
    return list
      .map((t, i) => ({ t, i }))
      .sort((a, b) => {
        const au = needsReaction(a.t, user?.id) ? 0 : 1;
        const bu = needsReaction(b.t, user?.id) ? 0 : 1;
        return au !== bu ? au - bu : a.i - b.i;
      })
      .map(({ t }) => t);
  }, [threads, hidden, filter, user?.id, blocked]);

  // "My Reactions" — friend + channel reactions merged, newest first.
  const myReactionsList = useMemo(() => {
    const fromThreads = myReactions
      .filter(r => !(r.sender_id && blocked.has(r.sender_id)) && !(r.thread_id && hidden.has(r.thread_id)))
      .map(r => ({
        kind: 'thread' as const,
        id: r.id,
        threadId: r.thread_id,
        reactionId: r.id,
        created_at: r.created_at,
        thumbnail: r.video_thumbnail
          ?? (r.source_type === 'youtube' && r.video_id ? `https://img.youtube.com/vi/${r.video_id}/hqdefault.jpg` : null),
        title: r.video_title ?? 'Video',
        subtitle: r.sender ? `@${r.sender.handle}` : 'Friend',
        meta: `${r.reaction_count} reaction${r.reaction_count !== 1 ? 's' : ''}`,
      }));
    const fromChannels = myChannelReactions.map(r => ({
      kind: 'channel' as const,
      id: r.id,
      created_at: r.created_at,
      thumbnail: r.parent_yt_video_thumbnail
        ?? (r.parent_source_type === 'youtube' && r.parent_yt_video_id
          ? `https://img.youtube.com/vi/${r.parent_yt_video_id}/hqdefault.jpg`
          : null),
      title: r.parent_yt_video_title ?? 'Video',
      subtitle: r.channel_name ?? 'Channel',
      meta: r.duration ? `▶ ${r.duration}s reaction` : 'Reaction',
    }));
    return [...fromThreads, ...fromChannels].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [myReactions, hidden, myChannelReactions, blocked]);

  // ── Unified Favorites: gather favorited entries from every source, newest first ──
  const favoritesList = useMemo(() => {
    const rows: FavRow[] = [];
    for (const t of threads) {
      if (blocked.has(t.sender_id) || hidden.has(t.id)) continue;
      const key = favKeyThread(t.id);
      const at = favs.get(key);
      if (at == null) continue;
      const isSender = t.sender_id === user?.id;
      const unreacted = !isSender && t.my_status !== 'reacted';
      rows.push({
        favKey: key, addedAt: at,
        thumbnail: unreacted ? null : (t.video_thumbnail ?? null),
        blind: unreacted,
        title: unreacted ? `${t.sender?.handle ?? 'Someone'} requested your reaction` : (t.video_title ?? t.video_id ?? 'Video'),
        subtitle: isSender ? 'you' : (t.sender?.handle ?? '?'),
        meta: unreacted ? '👀 Tap to react' : `${t.reaction_count} reaction${t.reaction_count !== 1 ? 's' : ''}`,
        onPress: () => navigation.navigate('Thread', { threadId: t.id }),
      });
    }
    for (const c of channelTiles) {
      const key = favKeyChannel(c.postId);
      const at = favs.get(key);
      if (at == null) continue;
      rows.push({
        favKey: key, addedAt: at, thumbnail: null, blind: true,
        title: 'React to reveal this video', subtitle: c.channelName || 'Channel', meta: '👀 Tap to react',
        onPress: () => (navigation as any).navigate('Channels', { screen: 'ChannelPost', params: { postId: c.postId, channelId: c.channelId, isJoined: true } }),
      });
    }
    for (const r of myReactionsList) {
      const key = favKeyReaction(r.kind, r.id);
      const at = favs.get(key);
      if (at == null) continue;
      rows.push({
        favKey: key, addedAt: at, thumbnail: r.thumbnail, blind: false,
        title: r.title, subtitle: r.subtitle, meta: r.meta,
        onPress: () => r.kind === 'thread'
          ? ((r as any).reactionId
            ? navigation.navigate('WatchReaction', { reactionId: (r as any).reactionId })
            : (r as any).threadId
              ? navigation.navigate('Thread', { threadId: (r as any).threadId })
              : undefined)
          : (navigation as any).navigate('Channels', { screen: 'WatchChannelClip', params: { postId: r.id } }),
      });
    }
    for (const rv of myReviews) {
      const key = favKeyReview(rv.id);
      const at = favs.get(key);
      if (at == null) continue;
      const thumb = rv.post_yt_video_thumbnail
        ?? (rv.post_source_type === 'youtube' && rv.post_yt_video_id
          ? `https://img.youtube.com/vi/${rv.post_yt_video_id}/hqdefault.jpg`
          : null);
      rows.push({
        favKey: key, addedAt: at, thumbnail: thumb, blind: false,
        title: rv.post_yt_video_title ?? 'Video', subtitle: rv.channel_name ?? 'Channel',
        meta: `★ ${rv.duration ? `${rv.duration}s review` : 'Review'}`,
        onPress: () => navigation.navigate('WatchReview', { reviewId: rv.id }),
      });
    }
    return rows.sort((a, b) => b.addedAt - a.addedAt);
  }, [threads, channelTiles, myReactionsList, myReviews, favs, hidden, blocked, user?.id, navigation]);

  // Pill counts (feed tab only — favorites has no pills).
  const counts = useMemo(() => {
    const visible = threads.filter(t => !hidden.has(t.id) && !blocked.has(t.sender_id));
    return {
      toreact: visible.filter(t => needsReaction(t, user?.id)).length,
      reactions: visible.filter(t => t.my_status === 'reacted').length,
      requests: visible.filter(t => t.sender_id === user?.id).length,
    } as Record<Filter, number>;
  }, [threads, hidden, user?.id, blocked]);

  const feedToReact = useMemo(
    () => threads.filter(t => !hidden.has(t.id) && !blocked.has(t.sender_id) && needsReaction(t, user?.id)).length,
    [threads, hidden, user?.id, blocked],
  );
  const setToReactCount = useFeedStore(s => s.setToReactCount);
  useEffect(() => { setToReactCount(feedToReact); }, [feedToReact, setToReactCount]);

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.ACCENT} /></View>;
  }

  const emptyFor = (title: string, sub: string) => (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{sub}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={{ marginTop: top }}>
        <View style={styles.header}>
          <Image source={require('../../../assets/driplogo.png')} style={styles.headerLogo} resizeMode="contain" />
          <View style={styles.wordmarkRow}>
            <Text style={[styles.wordmarkText, styles.titleVi]}>Vi</Text>
            <MaskedView
              style={{ width: dripSize.w, height: dripSize.h }}
              maskElement={
                <Text
                  style={styles.wordmarkText}
                  onLayout={e => {
                    const { width, height } = e.nativeEvent.layout;
                    setDripSize(s => (Math.abs(s.w - width) > 1 || Math.abs(s.h - height) > 1)
                      ? { w: width, h: height } : s);
                  }}>
                  drip
                </Text>
              }>
              <AnimatedLinearGradient
                colors={[FLOW_PINK, FLOW_PURPLE, FLOW_PINK, FLOW_PURPLE, FLOW_PINK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: dripSize.w * 2, height: dripSize.h, transform: [{ translateX: dripTranslateX }] }}
              />
            </MaskedView>
          </View>
          <MailboxButton style={styles.headerMail} />
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

        {/* Favorites is one flat collection — no categorization pills. */}
        {tab === 'feed' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {FILTERS.map(f => {
              const active = filter === f.key;
              const n = f.key === 'channels' ? channelTiles.length
                : f.key === 'reviews' ? myReviews.length
                : f.key === 'reactions' ? myReactionsList.length
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
        )}
      </View>

      {tab === 'feed' && (
        <ExclusiveRail
          onOpenGift={awardId => navigation.navigate('GiftReveal', { awardId })}
          onOpenCollection={collectionId => navigation.navigate('ExclusiveCollection', { collectionId })}
        />
      )}

      {tab === 'favorites' ? (
        <FlatList
          style={styles.fill}
          data={favoritesList}
          keyExtractor={r => r.favKey}
          contentContainerStyle={favoritesList.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={C.ACCENT} />}
          ListEmptyComponent={emptyFor('No favorites yet', 'Swipe left on any entry and tap the heart to save it here.')}
          renderItem={({ item }) => (
            <SwipeRow favKey={item.favKey} isFav onToggleFav={toggleFav} registerRef={registerRef} onWillOpen={closeOthers}>
              <FavCard row={item} />
            </SwipeRow>
          )}
        />
      ) : filter === 'channels' ? (
        <FlatList
          style={styles.fill}
          data={channelTiles}
          keyExtractor={item => item.postId}
          contentContainerStyle={channelTiles.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadChannels().finally(() => setRefreshing(false)); }} tintColor={C.ACCENT} />}
          ListEmptyComponent={emptyFor('All caught up', 'No new videos to react to from your channels.')}
          renderItem={({ item }) => {
            const key = favKeyChannel(item.postId);
            return (
              <SwipeRow favKey={key} isFav={favs.has(key)} onToggleFav={toggleFav} registerRef={registerRef} onWillOpen={closeOthers}>
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.8}
                  onPress={() => (navigation as any).navigate('Channels', {
                    screen: 'ChannelPost',
                    params: { postId: item.postId, channelId: item.channelId, isJoined: true },
                  })}>
                  <View style={styles.thumbnail}>
                    <View style={styles.thumbnailBlind}>
                      <Image source={questionmark} style={styles.thumbnailBlindImg} resizeMode="contain" />
                    </View>
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.sender} numberOfLines={1}>{item.channelName || 'Channel'}</Text>
                    <Text style={styles.title} numberOfLines={2}>React to reveal this video</Text>
                    <Text style={styles.meta}>👀 Tap to react</Text>
                  </View>
                </TouchableOpacity>
              </SwipeRow>
            );
          }}
        />
      ) : filter === 'reviews' ? (
        <FlatList
          style={styles.fill}
          data={myReviews}
          keyExtractor={item => item.id}
          contentContainerStyle={myReviews.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={<RefreshControl refreshing={reviewsLoading} onRefresh={loadReviews} tintColor={C.ACCENT} />}
          ListEmptyComponent={emptyFor('No reviews yet', 'Record a review after reacting to a channel post. They show up here.')}
          renderItem={({ item }) => {
            const thumb = item.post_yt_video_thumbnail
              ?? (item.post_source_type === 'youtube' && item.post_yt_video_id
                ? `https://img.youtube.com/vi/${item.post_yt_video_id}/hqdefault.jpg`
                : null);
            const key = favKeyReview(item.id);
            return (
              <SwipeRow favKey={key} isFav={favs.has(key)} onToggleFav={toggleFav} registerRef={registerRef} onWillOpen={closeOthers}>
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('WatchReview', { reviewId: item.id })}>
                  <View style={styles.thumbnail}>
                    {thumb ? <Image source={{ uri: thumb }} style={styles.thumbnailImage} /> : <Text style={styles.thumbnailIcon}>★</Text>}
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.sender} numberOfLines={1}>{item.channel_name ?? 'Channel'}</Text>
                    <Text style={styles.title} numberOfLines={2}>{item.post_yt_video_title ?? 'Video'}</Text>
                    <Text style={styles.meta}>★ {item.duration ? `${item.duration}s review` : 'Review'}</Text>
                  </View>
                </TouchableOpacity>
              </SwipeRow>
            );
          }}
        />
      ) : filter === 'reactions' ? (
        <FlatList
          style={styles.fill}
          data={myReactionsList}
          keyExtractor={item => `${item.kind}:${item.id}`}
          contentContainerStyle={myReactionsList.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); Promise.all([loadMyReactions(), loadChannelReactions()]).finally(() => setRefreshing(false)); }} tintColor={C.ACCENT} />}
          ListEmptyComponent={emptyFor('No reactions yet', 'React to a friend’s video or a channel clip and it shows up here.')}
          renderItem={({ item }) => {
            const key = favKeyReaction(item.kind, item.id);
            return (
              <SwipeRow favKey={key} isFav={favs.has(key)} onToggleFav={toggleFav} registerRef={registerRef} onWillOpen={closeOthers}>
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.8}
                  onPress={() => item.kind === 'thread'
                    ? (item.reactionId
                      ? navigation.navigate('WatchReaction', { reactionId: item.reactionId })
                      : item.threadId
                        ? navigation.navigate('Thread', { threadId: item.threadId })
                        : undefined)
                    : (navigation as any).navigate('Channels', { screen: 'WatchChannelClip', params: { postId: item.id } })}>
                  <View style={styles.thumbnail}>
                    {item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={styles.thumbnailImage} /> : <Text style={styles.thumbnailIcon}>▶</Text>}
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.sender} numberOfLines={1}>{item.subtitle}</Text>
                    <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.meta}>{item.meta}</Text>
                  </View>
                </TouchableOpacity>
              </SwipeRow>
            );
          }}
        />
      ) : (
        <FlatList
          style={styles.fill}
          data={displayed}
          keyExtractor={item => item.id}
          contentContainerStyle={displayed.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.ACCENT} />}
          ListEmptyComponent={emptyFor(
            filter === 'toreact' ? 'All caught up' : filter === 'requests' ? 'No requests yet' : 'Nothing here yet',
            filter === 'toreact' ? 'No friend videos waiting for your reaction'
              : filter === 'requests' ? 'Shorts you send friends to react to show up here'
              : 'Share a Short with a friend to get started',
          )}
          renderItem={({ item }) => {
            const isPending = item.my_status === 'pending';
            const isSender = item.sender_id === user?.id;
            const unreacted = !isSender && item.my_status !== 'reacted';
            const label = isSender ? 'you' : (item.sender?.handle ?? '?');
            const key = favKeyThread(item.id);
            return (
              <SwipeRow
                favKey={key}
                isFav={favs.has(key)}
                onToggleFav={toggleFav}
                onDelete={() => hideThread(item.id)}
                registerRef={registerRef}
                onWillOpen={closeOthers}>
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('Thread', { threadId: item.id })}>
                  <View style={styles.thumbnail}>
                    {unreacted ? (
                      <View style={styles.thumbnailBlind}>
                        <Image source={questionmark} style={styles.thumbnailBlindImg} resizeMode="contain" />
                      </View>
                    ) : item.video_thumbnail ? (
                      <Image source={{ uri: item.video_thumbnail }} style={styles.thumbnailImage} />
                    ) : (
                      <Text style={styles.thumbnailIcon}>▶</Text>
                    )}
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.sender}>{label}</Text>
                    <Text style={styles.title} numberOfLines={2}>
                      {unreacted ? `${item.sender?.handle ?? 'Someone'} requested your reaction` : (item.video_title ?? item.video_id)}
                    </Text>
                    <Text style={styles.meta}>
                      {unreacted ? '👀 Tap to react' : `${item.reaction_count} reaction${item.reaction_count !== 1 ? 's' : ''}`}
                    </Text>
                  </View>
                  {isPending && <View style={styles.dot} />}
                </TouchableOpacity>
              </SwipeRow>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.BG },
  fill:       { flex: 1 },
  center:     { flex: 1, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.SM,
    paddingHorizontal: SPACE.LG,
    paddingTop: SPACE.LG,
    paddingBottom: 0,
    zIndex: 10,
  },
  headerMail: { marginLeft: 'auto', marginTop: -3 },
  headerLogo: { width: 48, height: 84, marginTop: -8, marginBottom: -32, pointerEvents: 'none' },
  wordmarkRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, marginLeft: -5 },
  wordmarkText: {
    fontSize: FONT.SIZES.XXL,
    fontFamily: FONT.DISPLAY_BOLD,
    fontWeight: FONT.WEIGHTS.BOLD,
    letterSpacing: -1,
    textTransform: 'uppercase',
    color: C.BLACK,
  },
  titleVi: { color: C.WHITE },

  // Tab toggle
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: SPACE.LG,
    marginBottom: SPACE.XS,
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    padding: 3,
    gap: 3,
  },
  tabBtn: { flex: 1, paddingVertical: SPACE.SM, alignItems: 'center', borderRadius: RADIUS.SM },
  tabBtnActive: { backgroundColor: C.ACCENT },
  tabLabel: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  tabLabelActive: { color: C.WHITE },
  filterRow: { gap: SPACE.SM, paddingHorizontal: SPACE.LG, marginTop: SPACE.SM, marginBottom: SPACE.XS, alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACE.MD, paddingVertical: 6, borderRadius: RADIUS.FULL,
    backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER,
  },
  pillActive: { borderColor: C.DANGER },
  pillTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  pillTxtActive: { color: C.DANGER },
  pillCount: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: C.ACCENT, alignItems: 'center', justifyContent: 'center',
  },
  pillCountActive: { backgroundColor: C.ACCENT_HOT },
  pillCountTxt: { fontSize: 11, fontFamily: FONT.BODY_BOLD, color: C.WHITE, textAlign: 'center', includeFontPadding: false, marginTop: -4 },

  list:           { paddingHorizontal: SPACE.LG, paddingTop: SPACE.MD, paddingBottom: SPACE.LG, gap: SPACE.MD },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
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
  thumbnailImage: { width: 72, height: 72 },
  thumbnailIcon:  { fontSize: 24 },
  thumbnailBlind: { width: 72, height: 72, backgroundColor: C.BLACK, alignItems: 'center', justifyContent: 'center' },
  thumbnailBlindImg: { width: 22, height: 32 },

  // Favorite badge — absolute top-left corner of the entry.
  favHeart: {
    position: 'absolute', top: 7, left: 7,
    width: 20, height: 20, borderRadius: RADIUS.FULL,
    backgroundColor: '#FF2D7A',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  // "Swipe me" hint on the right edge of every row.
  swipeHint: { position: 'absolute', right: 6, top: 0, bottom: 0, justifyContent: 'center', opacity: 0.5 },

  info:   { flex: 1, paddingRight: SPACE.LG }, // clearance so long titles don't crowd the swipe caret
  sender: { fontSize: FONT.SIZES.SM, color: C.MUTED, marginBottom: 2 },
  title:  { fontSize: FONT.SIZES.MD, fontWeight: '600', color: C.INK, marginBottom: 4 },
  meta:   { fontSize: FONT.SIZES.SM, color: C.MUTED },
  dot:    { width: 10, height: 10, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT, marginRight: SPACE.SM },

  // Swipe action pane — on-brand tiles.
  actionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.SM,
    paddingHorizontal: SPACE.SM,
  },
  actionBtn: { alignItems: 'center', justifyContent: 'center' },
  actionTile: {
    width: 54, height: 54, borderRadius: RADIUS.MD,
    alignItems: 'center', justifyContent: 'center',
  },
  actionTileDel: { backgroundColor: 'rgba(255,59,48,0.16)', borderWidth: 1, borderColor: 'rgba(255,59,48,0.4)' },
});
