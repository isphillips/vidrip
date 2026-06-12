import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, Pressable, Image,
  ActivityIndicator, RefreshControl, TouchableOpacity, Modal, FlatList,
  useWindowDimensions, Animated, Easing,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { supabase } from '../../../infrastructure/supabase/client';
import {
  fetchChannelPosts,
  fetchChannelPost,
  fetchChannelMembers,
  fetchChannelName,
  markChannelAsRead,
  addChannelPostEmojiReaction,
  removeChannelPostEmojiReaction,
  deleteChannelPost,
  joinChannel,
  leaveChannel,
  postChannelAudio,
  fetchChannelReviewSettings,
  fetchChannelReactions,
  fetchChannelReviews,
  fetchChannelDisplayName,
  type ChannelPost,
  type ChannelClipTile,
  type ChannelReview,
} from '../../../infrastructure/supabase/queries/channels';
import {
  startAudioRecording,
  stopAudioRecording,
  cancelAudioRecording,
} from '../../../infrastructure/native/audioRecorder';
import { resolveTikTokThumbnail } from '../../../infrastructure/tiktok/api';
import ChannelMessageBubble from '../components/ChannelMessageBubble';
import ChannelSettingsSheet from '../components/ChannelSettingsSheet';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

type GridFilter = 'all' | 'reactions' | 'reviews';
const GRID_FILTERS: { key: GridFilter; label: string }[] = [
  { key: 'all', label: 'Posts' },
  { key: 'reactions', label: 'Reactions' },
  { key: 'reviews', label: 'Reviews' },
];

export default function ChannelhamburderScreen({
  route,
  navigation,
}: ChannelsStackScreenProps<'Channel'>) {
  const { channelId, channelName, isPublic, isJoined: isJoinedParam, isOwner, isMembersOnly, inviteOnly: inviteOnlyParam, ownerHandle } = route.params;
  const { user } = useAuthStore();
  const { top } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardW = (width - SPACE.LG * 2 - SPACE.MD) / 2;
  const cardH = Math.round(cardW * (16 / 9));

  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joined, setJoined] = useState(isJoinedParam);
  const [reviewsEnabled, setReviewsEnabled] = useState(false);
  const [inviteOnly, setInviteOnly] = useState(!!inviteOnlyParam);
  const [isListed, setIsListed] = useState(false); // groups.is_public — public visibility
  const [filter, setFilter] = useState<GridFilter>('all');
  const [reactionTiles, setReactionTiles] = useState<ChannelClipTile[]>([]);
  const [reviewTiles, setReviewTiles] = useState<ChannelReview[]>([]);
  // Fresh TikTok thumbnails resolved by video id (stored ones expire — see api.ts).
  const [ttThumbs, setTtThumbs] = useState<Record<string, string>>({});
  // Members Only channels show the creator's handle as the title, not the group name.
  const [title, setTitle] = useState(
    isMembersOnly && ownerHandle ? `${ownerHandle}` : channelName,
  );
  const [membersVisible, setMembersVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [members, setMembers] = useState<{ userId: string; handle: string }[]>([]);
  const [joiningLeaving, setJoiningLeaving] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [isHoldingMic, setIsHoldingMic] = useState(false);
  const [audioElapsed, setAudioElapsed] = useState(0);
  const audioTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pendingAudio, setPendingAudio] = useState<{ path: string; duration: number } | null>(null);
  const [sendingAudio, setSendingAudio] = useState(false);
  const cogAnim = useRef(new Animated.Value(0)).current;  // 0 idle → 1 active (spin + red)
  const mountedRef = useRef(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const postsRef = useRef<ChannelPost[]>([]);   // always-current snapshot for handlers

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // Cog spins + reddens when the menu opens, reverses when it closes.
  useEffect(() => {
    Animated.timing(cogAnim, {
      toValue: menuVisible ? 1 : 0,
      duration: menuVisible ? 450 : 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // color interpolation isn't native-driver compatible
    }).start();
  }, [menuVisible, cogAnim]);

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); }
    try {
      const data = await fetchChannelPosts(channelId, user?.id);
      if (mountedRef.current) { setPosts(data); }
      fetchChannelReviewSettings(channelId)
        .then(s => { if (mountedRef.current) { setReviewsEnabled(s.reviewsEnabled); setInviteOnly(s.inviteOnly); setIsListed(s.isListed); } })
        .catch(() => {});
    } catch { /* swallow */ } finally {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, [channelId]);

  // Keep postsRef in sync
  useEffect(() => { postsRef.current = posts; }, [posts]);

  // Fetch current channel name (DB trigger may have updated it since nav)
  useEffect(() => {
    if (!isPublic) {
      fetchChannelName(channelId).then(n => { if (n && mountedRef.current) { setTitle(n); } });
    }
  }, [channelId, isPublic]);

  // A creator-set display name overrides the default title (handle / group name).
  useEffect(() => {
    fetchChannelDisplayName(channelId).then(n => { if (n && mountedRef.current) { setTitle(n); } });
  }, [channelId]);

  // Realtime: update title when groups.name changes (DB trigger fires on member add/leave)
  useEffect(() => {
    if (isPublic) { return; }
    const sub = (supabase as any)
      .channel(`channel-name-${channelId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${channelId}` },
        (p: any) => { if (p.new?.name) { setTitle(p.new.name); } })
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [channelId, isPublic]);

  const handleShowMembers = useCallback(async () => {
    try {
      const list = await fetchChannelMembers(channelId);
      setMembers(list);
      setMembersVisible(true);
    } catch { /* ignore */ }
  }, [channelId]);

  useEffect(() => {
    load().then(() => {
      if (!isPublic) {
        // Give the ScrollView one frame to render before scrolling to bottom
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 50);
      }
    });
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  // Silently reload whenever the screen comes back into focus — covers returning
  // from AddChannelVideo (public) or ChannelVideoRecord (private) after posting.
  useFocusEffect(useCallback(() => {
    if (isPublic) {
      load(true);
      return;
    }
    markChannelAsRead(channelId).catch(() => {});
    load(true).then(() => {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 50);
    });
    fetchChannelName(channelId).then(n => { if (n && mountedRef.current) { setTitle(n); } });
  }, [isPublic, load, channelId]));
  // Realtime subscription handles new posts — no focus-reload needed here.

  // Realtime: new posts appear live
  useEffect(() => {
    const channel = (supabase as any)
      .channel(`channel-posts-${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'channel_posts',
        filter: `channel_id=eq.${channelId}`,
      }, async (payload: any) => {
        const newPost = await fetchChannelPost(payload.new.id);
        if (!newPost || !mountedRef.current) { return; }
        // Members Only channels are a video grid — status posts don't belong.
        if (isMembersOnly && newPost.post_type === 'status') { return; }
        setPosts(prev => {
          const pinned = prev.filter(p => p.is_pinned);
          const rest = prev.filter(p => !p.is_pinned);
          return [...pinned, newPost, ...rest];
        });
        if (isPublic) {
          scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        } else {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [channelId, isPublic, isMembersOnly]);

  const handleJoinLeave = useCallback(async () => {
    if (!user?.id || joiningLeaving || isOwner) { return; }
    setJoiningLeaving(true);
    const wasJoined = joined;
    setJoined(!wasJoined); // optimistic
    try {
      if (wasJoined) {
        await leaveChannel(channelId, user.id);
      } else {
        await joinChannel(channelId, user.id);
      }
      // Reload posts so member count and state reflect the change
      load(true);
    } catch {
      if (mountedRef.current) { setJoined(wasJoined); } // revert
    } finally {
      if (mountedRef.current) { setJoiningLeaving(false); }
    }
  }, [user?.id, joined, joiningLeaving, channelId, isOwner, load]);

  const handleEmojiToggle = useCallback(async (postId: string, emoji: string) => {
    if (!user?.id || processing.has(`${postId}:${emoji}`)) { return; }
    const key = `${postId}:${emoji}`;
    const post = posts.find(p => p.id === postId);
    if (!post) { return; }
    const mine = post.emoji_reactions.find(r => r.emoji === emoji && r.user_id === user.id);

    setProcessing(prev => new Set([...prev, key]));
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) { return p; }
      return {
        ...p,
        emoji_reactions: mine
          ? p.emoji_reactions.filter(r => !(r.emoji === emoji && r.user_id === user.id))
          : [...p.emoji_reactions, { emoji, user_id: user.id! }],
      };
    }));

    try {
      if (mine) {
        await removeChannelPostEmojiReaction(postId, user.id, emoji);
      } else {
        await addChannelPostEmojiReaction(postId, user.id, emoji);
      }
    } catch {
      load(true);
    } finally {
      setProcessing(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, [user?.id, posts, processing, load]);

  const handleDeletePost = useCallback(async (postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
    try { await deleteChannelPost(postId); } catch { load(true); }
  }, [load]);

  // The Reactions / Reviews filters show the actual clips (not source posts), so
  // load them when their pill is active. Refetch on switch to stay fresh.
  useEffect(() => {
    if (filter === 'reactions') {
      fetchChannelReactions(channelId).then(d => { if (mountedRef.current) { setReactionTiles(d); } }).catch(() => {});
    } else if (filter === 'reviews') {
      fetchChannelReviews(channelId).then(d => { if (mountedRef.current) { setReviewTiles(d); } }).catch(() => {});
    }
  }, [filter, channelId]);

  // Resolve fresh TikTok thumbnails for any visible TikTok video (posts + clip tiles).
  useEffect(() => {
    const ids = new Set<string>();
    posts.forEach(p => { if (p.source_type === 'tiktok' && p.yt_video_id) { ids.add(p.yt_video_id); } });
    reactionTiles.forEach(c => { if (c.parent_source_type === 'tiktok' && c.parent_yt_video_id) { ids.add(c.parent_yt_video_id); } });
    reviewTiles.forEach(r => { if (r.post_source_type === 'tiktok' && r.post_yt_video_id) { ids.add(r.post_yt_video_id); } });
    ids.forEach(id => {
      if (ttThumbs[id]) { return; }
      resolveTikTokThumbnail(id).then(url => {
        if (url && mountedRef.current) { setTtThumbs(prev => (prev[id] ? prev : { ...prev, [id]: url })); }
      }).catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, reactionTiles, reviewTiles]);

  // Public grid (All): unseen (unreacted) videos bubble to top, pinned stays first.
  // Stable within each group — preserves the query's pinned-then-recency order.
  const gridPosts = useMemo(() => {
    const rank = (p: ChannelPost) => {
      if (p.is_pinned) { return 0; }
      const seen = isOwner || p.poster_id === user?.id || p.has_my_reaction;
      return seen ? 2 : 1;
    };
    // Members Only channels are a video grid — status posts don't belong.
    return posts
      .filter(p => !(isMembersOnly && p.post_type === 'status'))
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        const ra = rank(a.p), rb = rank(b.p);
        return ra !== rb ? ra - rb : a.i - b.i;
      })
      .map(({ p }) => p);
  }, [posts, isOwner, user?.id, isMembersOnly]);

  // Normalized tiles for the grid — posts, reaction clips, or review clips.
  type GridTile = {
    key: string;
    thumbnail: string | null;
    handle: string | null;   // shown as a chip over reaction/review clips
    title: string | null;
    meta: string;
    obscured: boolean;
    isPinned: boolean;
    locked: boolean;         // invite-only room, viewer not invited → 🔒, no entry
    badge: string | null;    // '▶' reaction · '★' review
    onPress: () => void;
  };
  // Invite-only rooms lock their videos for anyone who isn't the owner or a member.
  const inviteLocked = inviteOnly && !isOwner && !joined;
  // TikTok: ignore the stored (expired) URL — use the freshly resolved one.
  const ytThumb = (videoId: string | null, source: 'youtube' | 'tiktok' | 'instagram', stored: string | null) =>
    source === 'tiktok'
      ? (videoId ? ttThumbs[videoId] ?? null : null)
      : (stored ?? (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null));

  const gridTiles = useMemo<GridTile[]>(() => {
    if (filter === 'reactions') {
      return reactionTiles.map(c => ({
        key: c.id,
        thumbnail: ytThumb(c.parent_yt_video_id, c.parent_source_type, c.parent_yt_video_thumbnail),
        handle: c.handle,
        title: c.parent_yt_video_title,
        meta: c.duration ? `${c.duration}s reaction` : 'Reaction',
        obscured: false,
        isPinned: false,
        locked: false,
        badge: '▶',
        onPress: () => navigation.navigate('WatchChannelClip', { postId: c.id }),
      }));
    }
    if (filter === 'reviews') {
      return reviewTiles.map(r => ({
        key: r.id,
        thumbnail: ytThumb(r.post_yt_video_id, r.post_source_type, r.post_yt_video_thumbnail),
        handle: r.reviewer?.handle ?? null,
        title: r.post_yt_video_title,
        meta: r.duration ? `${r.duration}s review` : 'Review',
        obscured: false,
        isPinned: false,
        locked: false,
        badge: '★',
        onPress: () => navigation.navigate('WatchReview', { reviewId: r.id }),
      }));
    }
    return gridPosts.map(item => {
      const isOwnerOrPoster = isOwner || item.poster_id === user?.id;
      const obscured = !inviteLocked && !isOwnerOrPoster && !item.has_my_reaction;
      return {
        key: item.id,
        thumbnail: inviteLocked ? null : ytThumb(item.yt_video_id, item.source_type, item.yt_video_thumbnail),
        handle: null,
        title: inviteLocked ? null : (obscured ? null : item.yt_video_title),
        meta: inviteLocked
          ? 'Invite only'
          : item.reaction_count > 0
            ? `${item.reaction_count} reaction${item.reaction_count !== 1 ? 's' : ''}`
            : 'No reactions yet',
        obscured,
        isPinned: item.is_pinned,
        locked: inviteLocked,
        badge: null,
        onPress: () => {
          if (inviteLocked) {
            Alert.alert('Invite only', 'Ask the channel owner for an invite to watch and react.');
          } else if (item.post_type === 'youtube') {
            navigation.navigate('ChannelPost', { postId: item.id, channelId, isJoined: joined });
          } else {
            navigation.navigate('WatchChannelClip', { postId: item.id });
          }
        },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, reactionTiles, reviewTiles, gridPosts, isOwner, user?.id, channelId, joined, navigation, ttThumbs, inviteLocked]);

  // ── Audio recording handlers ──────────────────────────────────────────────
  const handleMicPressIn = useCallback(async () => {
    setIsHoldingMic(true);
    setAudioElapsed(0);
    audioTimerRef.current = setInterval(() => setAudioElapsed(s => s + 1), 1000);
    try {
      await startAudioRecording();
    } catch (e) {
      clearInterval(audioTimerRef.current!); audioTimerRef.current = null;
      setIsHoldingMic(false);
    }
  }, []);

  const handleMicPressOut = useCallback(async () => {
    clearInterval(audioTimerRef.current!); audioTimerRef.current = null;
    setIsHoldingMic(false);
    setAudioElapsed(0);
    try {
      const result = await stopAudioRecording();
      if (result.duration < 0.5) {
        await cancelAudioRecording().catch(() => {});
        return;
      }
      setPendingAudio(result);
    } catch (e) {
    }
  }, []);

  const handleAudioSend = useCallback(async () => {
    if (!pendingAudio || !user?.id) { return; }
    setSendingAudio(true);
    try {
      await postChannelAudio({ channelId, userId: user.id, filePath: pendingAudio.path, duration: pendingAudio.duration });
      setPendingAudio(null);
      load(true).then(() => {
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50);
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not send audio.');
    }
    setSendingAudio(false);
  }, [pendingAudio, user?.id, channelId, load]);

  const handleAudioCancel = useCallback(async () => {
    setPendingAudio(null);
    await cancelAudioRecording().catch(() => {});
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: top + SPACE.SM }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.titleBtn}
          onPress={!isPublic ? handleShowMembers : undefined}
          activeOpacity={isPublic ? 1 : 0.7}>
          <Text style={styles.channelName} numberOfLines={1}>{title}</Text>
        </TouchableOpacity>

        {isOwner && isPublic ? (
          <TouchableOpacity style={styles.menuBtn} hitSlop={8} activeOpacity={0.7}
            onPress={() => setMenuVisible(true)}>
            <Animated.Text style={[styles.menuIcon, {
              color: cogAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [C.INK, C.ACCENT_HOT, C.ACCENT_HOT] }),
              transform: [{ rotate: cogAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
            }]}>⚙</Animated.Text>
          </TouchableOpacity>
        ) : isPublic && inviteOnly && !joined ? (
          // Invite-only room, not a member — can't self-join.
          <View style={styles.lockedHeaderPill}>
            <Text style={styles.lockedHeaderText}>🔒 Invite only</Text>
          </View>
        ) : isPublic ? (
          <TouchableOpacity
            style={[styles.joinBtn, joined && styles.joinBtnActive]}
            onPress={handleJoinLeave} disabled={joiningLeaving} activeOpacity={0.8}>
            <Text style={[styles.joinBtnText, joined && styles.joinBtnTextActive]}>
              {joiningLeaving ? '…' : joined ? 'Leave' : 'Join'}
            </Text>
          </TouchableOpacity>
        ) : (
          // Private channel top-right: add people + leave
          <View style={styles.headerActions}>
            <TouchableOpacity hitSlop={8}
              onPress={() => navigation.navigate('AddChannelMembers', { channelId })}>
              <Image source={require('../../../assets/icon-addfriend.png')} style={styles.headerActionImg} resizeMode="contain" />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={8} onPress={() => {
              Alert.alert('Leave channel?', '', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Leave', style: 'destructive', onPress: () => {
                  if (user?.id) { leaveChannel(channelId, user.id).then(() => navigation.goBack()); }
                }},
              ]);
            }}>
              <Image source={require('../../../assets/icon-leave.png')} style={styles.headerActionImg} resizeMode="contain" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Recording toast — under header, only while holding mic */}
      {isHoldingMic && (
        <View style={styles.recordingToast}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>
            Recording… {String(Math.floor(audioElapsed / 60)).padStart(2, '0')}:{String(audioElapsed % 60).padStart(2, '0')}
          </Text>
        </View>
      )}

      {/* Reviews filter pills — public grid only, when the creator enabled reviews */}
      {isPublic && reviewsEnabled && !loading && (
        <View style={styles.filterRow}>
          {GRID_FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <TouchableOpacity key={f.key} style={[styles.pill, active && styles.pillActive]}
                onPress={() => setFilter(f.key)} activeOpacity={0.8}>
                <Text style={[styles.pillTxt, active && styles.pillTxtActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} /></View>
      ) : isPublic ? (
        <FlatList
          data={gridTiles}
          keyExtractor={item => item.key}
          numColumns={2}
          contentContainerStyle={gridTiles.length === 0 ? styles.emptyContainer : styles.grid}
          columnWrapperStyle={styles.gridRow}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.ACCENT_HOT} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {filter === 'reactions' ? 'No reactions yet'
                  : filter === 'reviews' ? 'No reviews yet'
                  : 'No posts yet'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.gridCard, { width: cardW }]}
              activeOpacity={0.8}
              onPress={item.onPress}>
              <View style={[styles.gridThumb, { height: cardH }]}>
                {item.locked ? (
                  <View style={styles.gridThumbBlind}>
                    <Image source={require('../../../assets/lock.png')} style={styles.gridThumbBlindImg} resizeMode="contain" />
                  </View>
                ) : item.obscured ? (
                  <View style={styles.gridThumbBlind}>
                    <Image source={require('../../../assets/questionmark.png')} style={styles.gridThumbBlindImg} resizeMode="contain" />
                  </View>
                ) : item.thumbnail ? (
                  <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <View style={[styles.gridThumbBlind, { backgroundColor: C.SURFACE_2 }]}>
                    <Text style={styles.gridThumbBlindIcon}>▶</Text>
                  </View>
                )}
                {item.isPinned && (
                  <View style={styles.pinBadge}><Text style={styles.pinBadgeText}>📌</Text></View>
                )}
                {/* Clip tiles: play scrim + reactor/reviewer chip */}
                {item.badge && !item.obscured && (
                  <View style={styles.tilePlay}><Text style={styles.tilePlayIcon}>{item.badge}</Text></View>
                )}
                {item.handle && (
                  <View style={styles.tileHandle}>
                    <Text style={styles.tileHandleTxt} numberOfLines={1}>@{item.handle}</Text>
                  </View>
                )}
              </View>
              {item.obscured ? (
                <Text style={styles.gridTitleObscured}>React to reveal</Text>
              ) : item.title ? (
                <Text style={styles.gridTitle} numberOfLines={2}>{item.title}</Text>
              ) : null}
              <Text style={[
                styles.gridReactionCount,
                !item.obscured && !item.title && styles.gridReactionCountNoTitle,
              ]}>
                {item.meta}
              </Text>
            </TouchableOpacity>
          )}
        />
      ) : (
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[posts.length === 0 ? styles.emptyContainer : undefined, styles.msgPad]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.ACCENT_HOT} />}>
          {posts.length === 0 ? (
            <View style={styles.center}><Text style={styles.emptyText}>No messages yet</Text></View>
          ) : (
            [...posts].reverse().map(item => (
              <ChannelMessageBubble key={item.id} post={item}
                isMe={item.poster_id === user?.id} userId={user?.id}
                onPress={() => navigation.navigate('WatchChannelClip', { postId: item.id })}
                onEmojiToggle={emoji => handleEmojiToggle(item.id, emoji)}
                onDelete={() => handleDeletePost(item.id)} />
            ))
          )}
        </ScrollView>
      )}

      {/* Private channel: pending audio preview */}
      {!isPublic && pendingAudio && (
        <View style={styles.audioPreview}>
          <Image source={require('../../../assets/icon-audio.png')} style={styles.audioPreviewIcon} resizeMode="contain" />
          <Text style={styles.audioPreviewText}>{pendingAudio.duration.toFixed(1)}s</Text>
          <TouchableOpacity onPress={handleAudioCancel} hitSlop={8}>
            <Text style={styles.audioPreviewCancel}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.audioSendBtn} onPress={handleAudioSend}
            disabled={sendingAudio} activeOpacity={0.8}>
            {sendingAudio
              ? <ActivityIndicator color={C.WHITE} size="small" />
              : <Text style={styles.audioSendText}>Send</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Private channel: bottom bar with video + mic */}
      {!isPublic && !pendingAudio && (
        <View style={styles.bottomBar}>
          <View style={styles.barBtns}>
            <TouchableOpacity style={styles.barBtn}
              onPress={() => navigation.navigate('ChannelVideoRecord', { channelId })}
              activeOpacity={0.8}>
              <Image source={require('../../../assets/icon-video.png')} style={styles.barIcon} resizeMode="contain" />
              <View style={styles.gloss} pointerEvents="none" />
            </TouchableOpacity>
            <Pressable
              onPressIn={handleMicPressIn}
              onPressOut={handleMicPressOut}
              style={[styles.barBtn, isHoldingMic && styles.barBtnActive]}>
              <Image
                source={require('../../../assets/icon-audio.png')}
                style={[styles.barIcon, isHoldingMic && styles.barIconRecording]}
                resizeMode="contain" />
              <View style={styles.gloss} pointerEvents="none" />
            </Pressable>
          </View>
        </View>
      )}

      {/* Members modal */}
      <Modal visible={membersVisible} transparent animationType="slide" onRequestClose={() => setMembersVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMembersVisible(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Members</Text>
            <FlatList
              data={members}
              keyExtractor={m => m.userId}
              renderItem={({ item }) => (
                <Text style={styles.modalMember}>@{item.handle}</Text>
              )}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setMembersVisible(false)}>
              <Text style={styles.modalCloseTxt}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Creator settings drawer (shared with the Account screen) */}
      <ChannelSettingsSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        channelId={channelId}
        title={title}
        inviteOnly={inviteOnly}
        isListed={isListed}
        onInviteOnlyChange={setInviteOnly}
        onListedChange={setIsListed}
        onTitleChange={setTitle}
        onPostVideo={() => navigation.navigate('AddChannelVideo', { channelId })}
        onReviews={() => navigation.navigate('ChannelReviews', { channelId, channelName: title })}
        onInvitePeople={() => navigation.navigate('InviteToChannel', { channelId, channelName: title })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.MD,
    paddingBottom: SPACE.MD,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
    gap: SPACE.SM,
  },
  backBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: {
    fontSize: 28, color: C.INK, lineHeight: 32,
    fontFamily: FONT.BODY,
  },
  titleBtn: { flex: 1, alignSelf: 'center' },
  channelName: {
    fontSize: FONT.SIZES.LG,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.INK,
  },
  joinBtn: {
    paddingHorizontal: SPACE.MD,
    paddingVertical: SPACE.XS + 1,
    borderRadius: RADIUS.FULL,
    borderWidth: 1,
    borderColor: C.ACCENT,
  },
  joinBtnActive: {
    backgroundColor: C.ACCENT_LITE,
  },
  joinBtnText: {
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY_MEDIUM,
    color: C.ACCENT_HOT,
  },
  joinBtnTextActive: {
    color: C.MUTED,
  },
  menuBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  menuIcon: { fontSize: 22, color: C.INK, lineHeight: 26 },
  lockedHeaderPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS + 1,
    borderRadius: RADIUS.FULL, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE,
  },
  lockedHeaderText: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  filterRow: {
    flexDirection: 'row',
    gap: SPACE.SM,
    paddingHorizontal: SPACE.LG,
    paddingVertical: SPACE.SM,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: SPACE.MD,
    paddingVertical: SPACE.XS + 1,
    borderRadius: RADIUS.FULL,
    borderWidth: 1,
    borderColor: C.BORDER,
    backgroundColor: C.SURFACE,
  },
  pillActive: { backgroundColor: C.ACCENT_LITE, borderColor: C.ACCENT },
  pillTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  pillTxtActive: { color: C.ACCENT_HOT },
  postVideoBtn: {
    paddingHorizontal: SPACE.MD,
    paddingVertical: SPACE.XS + 1,
    borderRadius: RADIUS.FULL,
    backgroundColor: C.ACCENT,
  },
  postVideoBtnText: {
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY_MEDIUM,
    color: C.WHITE,
  },
  cameraBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  cameraBtnIcon: { fontSize: 22 },
  emptyText: {
    color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, textAlign: 'center',
  },
  msgPad: { paddingBottom: 100 },
  // Private channel header actions
  headerActions: { flexDirection: 'row', gap: SPACE.XL, alignItems: 'center' },
  headerActionIcon: { fontSize: 20 },
  headerActionImg: { width: 24, height: 24, tintColor: C.INK },
  // Bottom bar (private)
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: SPACE.XL, paddingVertical: SPACE.MD,
    backgroundColor: C.SURFACE,
    borderTopWidth: 1, borderTopColor: C.BORDER,
  },
  barBtn: {
    width: 52, height: 52, borderRadius: RADIUS.FULL,
    backgroundColor: C.SURFACE_2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.BORDER,
  },
  barBtns: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.XL },
  gloss: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
    borderTopLeftRadius: RADIUS.FULL, borderTopRightRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  barBtnActive: { backgroundColor: C.ACCENT_LITE, borderColor: C.ACCENT },
  barBtnIcon: { fontSize: 24 },
  barIcon: { width: 26, height: 26, tintColor: C.INK },
  barIconRecording: { tintColor: C.ACCENT_HOT },
  recordingBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACE.XS, paddingBottom: SPACE.XS,
  },
  recordingToast: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACE.SM, backgroundColor: C.ACCENT, paddingVertical: SPACE.SM,
  },
  recordingDot: { width: 8, height: 8, borderRadius: RADIUS.FULL, backgroundColor: C.WHITE },
  recordingText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.SURFACE, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG,
    padding: SPACE.LG, gap: SPACE.SM, maxHeight: '60%',
  },
  modalTitle: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK, marginBottom: SPACE.SM },
  modalMember: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM, color: C.INK, paddingVertical: SPACE.SM,
    borderBottomWidth: 1, borderBottomColor: C.BORDER },
  modalClose: {
    marginTop: SPACE.MD, backgroundColor: C.ACCENT, borderRadius: RADIUS.MD,
    padding: SPACE.MD, alignItems: 'center',
  },
  modalCloseTxt: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD },
  // Pending audio preview bar
  audioPreview: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD,
    backgroundColor: C.SURFACE, borderTopWidth: 1, borderTopColor: C.BORDER,
  },
  audioPreviewIcon: { width: 20, height: 20, tintColor: C.INK },
  audioPreviewText: { flex: 1, color: C.INK, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM },
  audioPreviewCancel: { color: C.MUTED, fontSize: 18 },
  audioSendBtn: {
    backgroundColor: C.ACCENT, borderRadius: RADIUS.MD,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.SM, minWidth: 60, alignItems: 'center',
  },
  audioSendText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD },

  // Public channel grid
  grid:    { paddingHorizontal: SPACE.LG, paddingTop: SPACE.MD, paddingBottom: SPACE.XXXL },
  gridRow: { gap: SPACE.MD, marginBottom: SPACE.MD },
  gridCard: { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, overflow: 'hidden' },
  gridThumb: { width: '100%', backgroundColor: C.SURFACE_2, overflow: 'hidden' },
  gridThumbBlind: { flex: 1, backgroundColor: C.BLACK, alignItems: 'center', justifyContent: 'center' },
  gridThumbBlindIcon: { fontSize: 28, color: 'rgba(255,255,255,0.4)', fontWeight: '700' },
  gridThumbBlindImg:  { width: 32, height: 46 },
  pinBadge: {
    position: 'absolute', top: SPACE.XS, left: SPACE.XS,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: RADIUS.SM,
    paddingHorizontal: 4, paddingVertical: 2,
  },
  tilePlay: {
    position: 'absolute', top: '50%', left: '50%',
    width: 44, height: 44, marginTop: -22, marginLeft: -22,
    borderRadius: RADIUS.FULL, backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  tilePlayIcon: { color: C.WHITE, fontSize: 18 },
  tileHandle: {
    position: 'absolute', bottom: SPACE.XS, left: SPACE.XS, right: SPACE.XS,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: RADIUS.SM,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  tileHandleTxt: { color: C.WHITE, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_SEMIBOLD },
  pinBadgeText: { fontSize: 11 },
  gridTitle: { padding: SPACE.SM, fontSize: FONT.SIZES.SM, color: C.INK, fontFamily: FONT.BODY_MEDIUM },
  gridTitleObscured: { padding: SPACE.SM, fontSize: FONT.SIZES.XS, color: C.MUTED, fontFamily: FONT.BODY, fontStyle: 'italic' },
  gridReactionCount: { paddingHorizontal: SPACE.SM, paddingBottom: SPACE.SM, fontSize: FONT.SIZES.XS, color: C.MUTED, fontFamily: FONT.BODY },
  gridReactionCountNoTitle: { paddingTop: SPACE.SM },
});
