import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, ActivityIndicator,
  TouchableOpacity, Pressable, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import GradientIcon from '../../../components/GradientIcon';
import DrippyEyes from '../../../components/DrippyEyes';
import { supabase } from '../../../infrastructure/supabase/client';
import {
  markThreadSeen, fetchThreadEmojiReactions,
  addThreadEmojiReaction, removeThreadEmojiReaction,
  fetchConversationShares, type ConversationShare,
} from '../../../infrastructure/supabase/queries/threads';
import {
  fetchChannelPosts, postChannelAudio, markChannelAsRead, ensurePrivateChannel, findPrivateChannel,
  deleteChannelPost, addChannelPostEmojiReaction, removeChannelPostEmojiReaction,
  type ChannelPost,
} from '../../../infrastructure/supabase/queries/channels';
import {
  startAudioRecording, stopAudioRecording, cancelAudioRecording,
} from '../../../infrastructure/native/audioRecorder';
import ChannelMessageBubble from '../../channels/components/ChannelMessageBubble';
import EmojiChips from '../../../components/EmojiChips';
import ReactionMenu from '../../../components/ReactionMenu';
import { QUICK_EMOJIS } from '../../../components/EmojiGlyph';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

const questionmark = require('../../../assets/questionmark.png');

// One row of the merged friend timeline: either a video share (thread, EITHER direction) or a DM
// clip/audio post. `at` is the EFFECTIVE timestamp used for ordering — a share's reaction time once
// reacted (so it sinks to the bottom), otherwise its sent time.
type TimelineItem =
  | { kind: 'share'; at: number; key: string; share: ConversationShare;
      title: string; thumbnail: string | null;
      emojiReactions: { emoji: string; user_id: string }[] }
  | { kind: 'post'; at: number; key: string; post: ChannelPost };

const ms = (iso?: string | null) => (iso ? Date.parse(iso) || 0 : 0);
const PAGE = 20;   // DM messages loaded per page (latest first; scroll up for older)
// Stable empty fallback for the threadIds param — a fresh `[]` default would change identity every
// render, churning buildItems/load and re-running the focus effect (which intermittently cancelled
// the in-flight load via its `active` guard → "DMs sometimes don't load").
const EMPTY_IDS: string[] = [];

// Fetch the DM messages with one retry — a single network/RLS blip used to resolve to [] (the
// catch in buildItems), blanking the DM history intermittently ("DMs sometimes don't load").
async function loadChannelPostsResilient(cid: string, uid: string, limit: number): Promise<ChannelPost[]> {
  try { return await fetchChannelPosts(cid, uid, { limit }); }
  catch {
    await new Promise(r => setTimeout(r, 400));
    try { return await fetchChannelPosts(cid, uid, { limit }); } catch { return []; }
  }
}

// Compact date + time for a timeline item - "Jun 12, 3:42 PM" (adds the year for items from past years).
const fmtStamp = (at: number): string => {
  if (!at) { return ''; }
  const d = new Date(at);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

export default function FriendConversationScreen({
  route, navigation,
}: FeedStackScreenProps<'FriendConversation'>) {
  const { top, bottom: safeBottom } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { friendUserId, displayName, handle, avatarUrl } = route.params;
  // Stable reference (see EMPTY_IDS) so the focus effect doesn't re-run every render.
  const threadIds = route.params.threadIds ?? EMPTY_IDS;

  // DM channel may not exist yet (friend we've only shared with), created lazily on compose.
  const [channelId, setChannelId] = useState<string | null>(route.params.dmChannelId ?? null);
  const channelIdRef = useRef<string | null>(channelId);
  channelIdRef.current = channelId;

  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Upward pagination: load the latest PAGE messages, grow the window as the user scrolls up.
  const loadedCountRef = useRef(PAGE);
  const draggedRef = useRef(false);   // armed on first user drag so the mount scroll-to-bottom can't trigger loadMore
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Audio composer state (mirrors ChannelScreen's mic flow).
  const [isHoldingMic, setIsHoldingMic] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<{ path: string; duration: number } | null>(null);
  const [sendingAudio, setSendingAudio] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const scrollToEnd = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);

  const buildItems = useCallback(async (): Promise<TimelineItem[]> => {
    if (!user) { return []; }
    const cid = channelIdRef.current;
    const limit = loadedCountRef.current;
    // Shares now come from the friend pair (BOTH directions), not the inbound-only route threadIds.
    const [shares, posts] = await Promise.all([
      fetchConversationShares(user.id, friendUserId).catch(() => [] as ConversationShare[]),
      cid ? loadChannelPostsResilient(cid, user.id, limit) : Promise.resolve([] as ChannelPost[]),
    ]);
    const reactByThread = await fetchThreadEmojiReactions(shares.map(s => s.id))
      .catch(() => new Map<string, { emoji: string; user_id: string }[]>());

    const postItems: TimelineItem[] = posts
      .filter(p => p.post_type !== 'status' || !!p.message)
      .map(p => ({ kind: 'post' as const, at: ms(p.created_at), key: `post:${p.id}`, post: p }));

    // DM messages are paginated (latest `limit`); a full page means there are older ones to scroll up to.
    const more = posts.length >= limit;
    setHasMore(more);
    // Window the (bounded, fully-loaded) shares to the loaded message range, so an old share can't show
    // above messages that haven't been paged in yet. Once every message is loaded, show all shares.
    const oldestPostAt = postItems.reduce((m, p) => (p.at && p.at < m ? p.at : m), Infinity);
    const lowerBound = more && oldestPostAt !== Infinity ? oldestPostAt : 0;

    const shareItems: TimelineItem[] = shares
      .map((s): TimelineItem => ({
        kind: 'share' as const,
        // Effective order: reaction time once reacted (sinks to the bottom), else sent time.
        at: s.reacted && s.reactedAt ? s.reactedAt : s.sentAt,
        key: `share:${s.id}`,
        share: s,
        title: s.video_title ?? 'Video',
        thumbnail: s.video_thumbnail
          ?? (s.source_type === 'youtube' && s.video_id ? `https://img.youtube.com/vi/${s.video_id}/hqdefault.jpg` : null),
        emojiReactions: reactByThread.get(s.id) ?? [],
      }))
      .filter(s => s.at >= lowerBound);

    return [...shareItems, ...postItems].sort((a, b) => a.at - b.at);
  }, [user, friendUserId]);

  // Scroll-up handler: grow the window by one page and refetch (load() keeps the current scroll via the
  // ScrollView's maintainVisibleContentPosition — no jump-to-bottom).
  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) { return; }
    setLoadingMore(true);
    loadedCountRef.current += PAGE;
    load().finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, loading]);

  const load = useCallback(async () => {
    try {
      setItems(await buildItems());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildItems]);

  // Resolve the 1:1 DM channel — used for composing AND on entry so existing DM history loads. The
  // conversation can arrive with a null dmChannelId (the peer→channel mapping isn't always resolved
  // upstream), so we FIND the existing channel first (loading real history) and only create one as a
  // fallback. Without this the timeline showed only shares until you posted a clip.
  const ensureChannel = useCallback(async (): Promise<string | null> => {
    if (channelIdRef.current) { return channelIdRef.current; }
    if (!user) { return null; }
    // Resolve (find existing, else create) with one retry — a transient failure here used to leave
    // channelId null, so the timeline showed shares but no DM history until a manual refresh.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const id = (await findPrivateChannel(user.id, friendUserId)) ?? (await ensurePrivateChannel(user.id, friendUserId));
        if (id) { setChannelId(id); channelIdRef.current = id; return id; }
      } catch { /* fall through to retry */ }
      if (attempt === 0) { await new Promise(r => setTimeout(r, 400)); }
    }
    return null;
  }, [user, friendUserId]);

  // Mark everything read on focus + subscribe to live DM posts.
  useFocusEffect(useCallback(() => {
    let active = true;
    let sub: ReturnType<typeof supabase.channel> | null = null;
    loadedCountRef.current = PAGE;   // fresh window on each entry
    draggedRef.current = false;

    (async () => {
      // Make sure the DM channel is resolved before building the timeline, so its history loads on entry.
      if (!channelIdRef.current) { await ensureChannel(); }
      // Always complete the load (setItems is safe on a still-mounted screen) — bailing here on a
      // transient `active` flip was a way the timeline could end up empty. Only the post-load side
      // effects (scroll, realtime subscribe) are gated on still being focused.
      await load();
      if (!active) { return; }
      scrollToEnd();

      const cid = channelIdRef.current;
      if (cid) {
        markChannelAsRead(cid).catch(() => {});
        // Unique topic per focus — removeChannel is async, so a static topic can still be registered
        // on a fast refocus, making supabase.channel() reuse the already-subscribed object (the .on()
        // then throws "cannot add postgres_changes callbacks after subscribe()").
        sub = supabase
          .channel(`dm-${cid}-${Date.now()}`)
          .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'channel_posts', filter: `channel_id=eq.${cid}` },
            () => { if (active) { load().then(scrollToEnd); } })
          .subscribe();
      }
    })();

    threadIds.forEach(id => markThreadSeen(id).catch(() => {}));

    return () => { active = false; if (sub) { supabase.removeChannel(sub); } };
  }, [load, threadIds, ensureChannel]));

  // ── Audio composer ───────────────────────────────────────────────────────────
  const handleMicPressIn = useCallback(async () => {
    setIsHoldingMic(true);
    try { await startAudioRecording(); }
    catch { setIsHoldingMic(false); }
  }, []);

  const handleMicPressOut = useCallback(async () => {
    setIsHoldingMic(false);
    try {
      const result = await stopAudioRecording();
      if (result.duration < 0.5) { await cancelAudioRecording().catch(() => {}); return; }
      setPendingAudio(result);
    } catch { /* ignore */ }
  }, []);

  const handleAudioSend = useCallback(async () => {
    if (!pendingAudio || !user) { return; }
    setSendingAudio(true);
    try {
      const cid = await ensureChannel();
      if (!cid) { throw new Error('Could not open chat'); }
      await postChannelAudio({ channelId: cid, userId: user.id, filePath: pendingAudio.path, duration: pendingAudio.duration });
      setPendingAudio(null);
      await load();
      scrollToEnd();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not send audio.');
    }
    setSendingAudio(false);
  }, [pendingAudio, user, ensureChannel, load]);

  const handleAudioCancel = useCallback(async () => {
    setPendingAudio(null);
    await cancelAudioRecording().catch(() => {});
  }, []);

  const handleVideoCompose = useCallback(async () => {
    const cid = await ensureChannel();
    if (cid) { navigation.navigate('ChannelVideoRecord', { channelId: cid }); }
  }, [ensureChannel, navigation]);

  // ── Post emoji / delete (DM bubbles) ──────────────────────────────────────────
  const handleEmojiToggle = useCallback(async (post: ChannelPost, emoji: string) => {
    if (!user) { return; }
    const mine = post.emoji_reactions.some(r => r.user_id === user.id && r.emoji === emoji);
    try {
      if (mine) { await removeChannelPostEmojiReaction(post.id, user.id, emoji); }
      else { await addChannelPostEmojiReaction(post.id, user.id, emoji); }
      await load();
    } catch { /* ignore */ }
  }, [user, load]);

  const handleDeletePost = useCallback(async (postId: string) => {
    try { await deleteChannelPost(postId); await load(); } catch { /* ignore */ }
  }, [load]);

  // ── Share emoji reactions (the "video to react to" cards) ─────────────────────
  const handleShareEmojiToggle = useCallback(async (
    share: Extract<TimelineItem, { kind: 'share' }>, emoji: string,
  ) => {
    if (!user) { return; }
    const uid = user.id;
    const threadId = share.share.id;
    const mine = share.emojiReactions.some(r => r.user_id === uid && r.emoji === emoji);
    // Optimistic: update this share's reactions in place; reconcile via load() only on failure.
    setItems(prev => prev.map(it =>
      it.kind === 'share' && it.share.id === threadId
        ? {
            ...it,
            emojiReactions: mine
              ? it.emojiReactions.filter(r => !(r.user_id === uid && r.emoji === emoji))
              : [...it.emojiReactions, { emoji, user_id: uid }],
          }
        : it));
    try {
      if (mine) { await removeThreadEmojiReaction(threadId, uid, emoji); }
      else { await addThreadEmojiReaction(threadId, uid, emoji); }
    } catch { load(); }
  }, [user, load]);

  const initial = (displayName || handle || '?').charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: top + SPACE.SM }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
        ) : (
          <View style={styles.headerAvatarFallback}><Text style={styles.headerAvatarLetter}>{initial}</Text></View>
        )}
        <Text style={styles.headerName} numberOfLines={1}>{displayName || `@${handle}`}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.ACCENT} /></View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[items.length === 0 ? styles.emptyContainer : styles.list]}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => { draggedRef.current = true; }}
          onScroll={e => { if (draggedRef.current && e.nativeEvent.contentOffset.y <= 60) { loadMore(); } }}
          // Keep the viewport anchored when older messages are prepended at the top (no jump-to-bottom).
          maintainVisibleContentPosition={items.length ? { minIndexForVisible: 1 } : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadedCountRef.current = PAGE; load(); }} tintColor={C.ACCENT_HOT} />}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No history yet</Text>
              <Text style={styles.emptySubtitle}>Share a Short or send a clip to start the conversation.</Text>
            </View>
          ) : (
            items.map((item, i) => {
              // Centered timestamp, shown only when >1h has passed since the previous item (declutter).
              const stamp = (i === 0 || item.at - items[i - 1].at > 3_600_000)
                ? <Text style={styles.stamp}>{fmtStamp(item.at)}</Text>
                : null;
              if (item.kind === 'share') {
                const mine = item.share.direction === 'mine';
                const reacted = item.share.reacted;
                // Theirs: blurred until I react (the blind-reveal mechanic). Mine: my own video, always shown.
                const showThumb = !!item.thumbnail && (mine || reacted);
                return (
                  <React.Fragment key={item.key}>
                    {stamp}
                    {/* Aligned column: mine → right, theirs → left, capped at 80% width. */}
                    <View style={[styles.shareCol, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}>
                      {/* Long-press the card → iOS-style reaction menu; a tap opens the thread. */}
                      <ReactionMenu
                        style={[styles.shareCard, mine && styles.shareCardMine]}
                        emojis={QUICK_EMOJIS}
                        mine={item.emojiReactions.filter(r => r.user_id === user?.id).map(r => r.emoji)}
                        onPick={emoji => handleShareEmojiToggle(item, emoji)}
                        onPress={() => navigation.navigate('Thread', { threadId: item.share.id })}>
                        <View style={styles.shareThumb}>
                          {showThumb ? (
                            <Image source={{ uri: item.thumbnail as string }} style={styles.shareThumbImg} />
                          ) : (
                            <View style={styles.shareThumbBlind}><Image source={questionmark} style={styles.shareThumbBlindImg} resizeMode="contain" /></View>
                          )}
                        </View>
                        <View style={styles.shareInfo}>
                          <Text style={styles.shareTitle} numberOfLines={2}>
                            {mine
                              ? item.title   /* my own video — always show its title (+ status below) */
                              : (reacted ? item.title : 'Sent you a video to react to')}
                          </Text>
                          {mine ? (
                            reacted
                              ? <Text style={styles.shareMeta}>✓ They reacted · tap to view</Text>
                              : <Text style={styles.shareMeta}>Waiting for their reaction…</Text>
                          ) : reacted ? (
                            <Text style={styles.shareMeta}>✓ Reacted · tap to view</Text>
                          ) : (
                            <View style={styles.shareMetaRow}>
                              <DrippyEyes size={12} />
                              <Text style={styles.shareMeta}>Tap to react</Text>
                            </View>
                          )}
                        </View>
                      </ReactionMenu>
                      {item.emojiReactions.length > 0 && (
                        <View style={[styles.shareReacts, { alignSelf: mine ? 'flex-end' : 'flex-start' }]}>
                          <EmojiChips
                            reactions={item.emojiReactions}
                            userId={user?.id}
                            onToggle={emoji => handleShareEmojiToggle(item, emoji)}
                            showAdd={false}
                          />
                        </View>
                      )}
                    </View>
                  </React.Fragment>
                );
              }
              const isMe = item.post.poster_id === user?.id;
              return (
                <React.Fragment key={item.key}>
                  {stamp}
                  <ChannelMessageBubble
                    post={item.post}
                    isMe={isMe}
                    userId={user?.id}
                    showTime={false}
                    reactionMenu
                    onPress={() => navigation.navigate('WatchChannelClip', { postId: item.post.id })}
                    onEmojiToggle={emoji => handleEmojiToggle(item.post, emoji)}
                    onDelete={() => handleDeletePost(item.post.id)}
                  />
                </React.Fragment>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Loading older messages (scroll-up pagination) */}
      {loadingMore && (
        <View style={[styles.loadingMore, { top: top + 64 }]} pointerEvents="none">
          <ActivityIndicator color={C.ACCENT} size="small" />
        </View>
      )}

      {/* Pending audio preview */}
      {pendingAudio ? (
        <View style={styles.audioPreview}>
          <GradientIcon name="mic" size={20} />
          <Text style={styles.audioPreviewText}>{pendingAudio.duration.toFixed(1)}s</Text>
          <TouchableOpacity onPress={handleAudioCancel} hitSlop={8}><Text style={styles.audioPreviewCancel}>✕</Text></TouchableOpacity>
          <TouchableOpacity style={styles.audioSendBtn} onPress={handleAudioSend} disabled={sendingAudio} activeOpacity={0.8}>
            {sendingAudio ? <ActivityIndicator color={C.WHITE} size="small" /> : <Text style={styles.audioSendText}>Send</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.barBtns, { bottom: safeBottom + 70 }]}>
          <TouchableOpacity style={styles.barBtn} onPress={handleVideoCompose} activeOpacity={0.8}>
            <GradientIcon name="videocam" size={26} />
          </TouchableOpacity>
          <Pressable onPressIn={handleMicPressIn} onPressOut={handleMicPressOut} style={[styles.barBtn, isHoldingMic && styles.barBtnActive]}>
            {isHoldingMic ? <Ionicons name="mic" size={26} color={C.ACCENT_HOT} /> : <GradientIcon name="mic" size={26} />}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    paddingHorizontal: SPACE.MD, paddingBottom: SPACE.SM,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  backBtn: { paddingHorizontal: SPACE.XS },
  backIcon: { fontSize: 34, color: C.INK, marginTop: -4 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.SURFACE_2 },
  headerAvatarFallback: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: C.ACCENT_LITE,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.ACCENT,
  },
  headerAvatarLetter: { fontSize: FONT.SIZES.MD, fontFamily: FONT.DISPLAY_BOLD, color: C.ACCENT },
  headerName: { flex: 1, fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK },

  list: { padding: SPACE.MD, gap: SPACE.SM, paddingBottom: SPACE.XL },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: SPACE.XL, gap: SPACE.SM },
  emptyTitle: { fontSize: FONT.SIZES.LG, fontWeight: '700', color: C.INK },
  emptySubtitle: { fontSize: FONT.SIZES.MD, color: C.MUTED, textAlign: 'center' },

  // Aligned column wrapping a share bubble + its emoji chips (mine → right, theirs → left).
  // Use a DEFINED width (not maxWidth): alignSelf makes this column shrink-wrap, and a shrink-wrapped
  // parent gives the card's flex:1 text column (shareInfo) zero width — collapsing the title/status to
  // nothing (only the fixed thumbnail + eyes show). 80% gives the text real room to flex into.
  shareCol: { width: '80%', gap: 4 },
  // Video-share card in the timeline
  shareCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.LG, padding: SPACE.MD,
    borderWidth: 1, borderColor: C.BORDER,
  },
  // My own sent video — accent-tinted bubble so the two sides read like a chat.
  shareCardMine: { backgroundColor: C.ACCENT_LITE, borderColor: C.ACCENT },
  shareThumb: { width: 64, height: 64, borderRadius: RADIUS.MD, overflow: 'hidden', backgroundColor: C.SURFACE_2 },
  shareThumbImg: { width: 64, height: 64 },
  shareThumbBlind: { width: 64, height: 64, backgroundColor: C.BLACK, alignItems: 'center', justifyContent: 'center' },
  shareThumbBlindImg: { width: 20, height: 28 },
  shareInfo: { flex: 1, gap: 4 },
  shareTitle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  shareMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shareMeta: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED },
  // Emoji reaction strip under a share bubble (aligned to the bubble's side inline).
  shareReacts: { marginTop: 2, marginBottom: 2 },

  // Centered date/time separator (only shown when >1h has passed since the previous item).
  stamp: { alignSelf: 'center', textAlign: 'center', fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, color: C.SUBTLE, paddingVertical: 2 },
  loadingMore: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },

  // Composer — floating record buttons, fixed bottom-right above the nav, stacked, Studio-style (shadowed pill).
  barBtns: { position: 'absolute', right: SPACE.LG, alignItems: 'center', gap: SPACE.MD },
  barBtn: {
    width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.SURFACE_2, borderWidth: 1, borderColor: C.BORDER_STRONG,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  barBtnActive: { backgroundColor: C.ACCENT_LITE, borderColor: C.ACCENT },
  audioPreview: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    borderTopWidth: 1, borderTopColor: C.BORDER, backgroundColor: C.SURFACE,
    paddingVertical: SPACE.SM, paddingHorizontal: SPACE.LG,
  },
  audioPreviewText: { flex: 1, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM, color: C.INK },
  audioPreviewCancel: { fontSize: FONT.SIZES.LG, color: C.MUTED, paddingHorizontal: SPACE.SM },
  audioSendBtn: {
    backgroundColor: C.ACCENT, borderRadius: RADIUS.FULL,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.SM, minWidth: 72, alignItems: 'center',
  },
  audioSendText: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_BOLD, color: C.WHITE },
});
