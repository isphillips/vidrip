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
import { fetchThread, markThreadSeen } from '../../../infrastructure/supabase/queries/threads';
import {
  fetchChannelPosts, postChannelAudio, markChannelAsRead, ensurePrivateChannel,
  deleteChannelPost, addChannelPostEmojiReaction, removeChannelPostEmojiReaction,
  type ChannelPost,
} from '../../../infrastructure/supabase/queries/channels';
import {
  startAudioRecording, stopAudioRecording, cancelAudioRecording,
} from '../../../infrastructure/native/audioRecorder';
import ChannelMessageBubble from '../../channels/components/ChannelMessageBubble';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

const questionmark = require('../../../assets/questionmark.png');

// One row of the merged friend timeline: either a video share (thread) or a DM clip/audio post.
type TimelineItem =
  | { kind: 'share'; at: number; key: string; threadId: string; title: string;
      thumbnail: string | null; reacted: boolean; sourceType: string }
  | { kind: 'post'; at: number; key: string; post: ChannelPost };

const ms = (iso?: string | null) => (iso ? Date.parse(iso) || 0 : 0);

export default function FriendConversationScreen({
  route, navigation,
}: FeedStackScreenProps<'FriendConversation'>) {
  const { top, bottom: safeBottom } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { friendUserId, displayName, handle, avatarUrl, threadIds = [] } = route.params;

  // DM channel may not exist yet (friend we've only shared with) — created lazily on compose.
  const [channelId, setChannelId] = useState<string | null>(route.params.dmChannelId ?? null);
  const channelIdRef = useRef<string | null>(channelId);
  channelIdRef.current = channelId;

  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Audio composer state (mirrors ChannelScreen's mic flow).
  const [isHoldingMic, setIsHoldingMic] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<{ path: string; duration: number } | null>(null);
  const [sendingAudio, setSendingAudio] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const scrollToEnd = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);

  const buildItems = useCallback(async (): Promise<TimelineItem[]> => {
    if (!user) { return []; }
    const cid = channelIdRef.current;
    const [threadDetails, posts] = await Promise.all([
      Promise.all(threadIds.map(id => fetchThread(id, user.id).catch(() => null))),
      cid ? fetchChannelPosts(cid, user.id).catch(() => [] as ChannelPost[]) : Promise.resolve([] as ChannelPost[]),
    ]);

    const shareItems: TimelineItem[] = threadDetails
      .filter(Boolean)
      .map((t: any) => ({
        kind: 'share' as const,
        at: ms(t.created_at),
        key: `share:${t.id}`,
        threadId: t.id,
        title: t.video_title ?? 'Video',
        thumbnail: t.video_thumbnail
          ?? (t.source_type === 'youtube' && t.video_id ? `https://img.youtube.com/vi/${t.video_id}/hqdefault.jpg` : null),
        reacted: t.my_status === 'reacted',
        sourceType: t.source_type ?? 'youtube',
      }));

    const postItems: TimelineItem[] = posts
      .filter(p => p.post_type !== 'status' || !!p.message)
      .map(p => ({ kind: 'post' as const, at: ms(p.created_at), key: `post:${p.id}`, post: p }));

    return [...shareItems, ...postItems].sort((a, b) => a.at - b.at);
  }, [user, threadIds]);

  const load = useCallback(async () => {
    try {
      setItems(await buildItems());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildItems]);

  // Mark everything read on focus + subscribe to live DM posts.
  useFocusEffect(useCallback(() => {
    let active = true;
    load().then(() => { if (active) { scrollToEnd(); } });
    const cid = channelIdRef.current;
    if (cid) { markChannelAsRead(cid).catch(() => {}); }
    threadIds.forEach(id => markThreadSeen(id).catch(() => {}));

    const cidForSub = channelIdRef.current;
    const sub = cidForSub
      ? supabase
          .channel(`dm-${cidForSub}`)
          .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'channel_posts', filter: `channel_id=eq.${cidForSub}` },
            () => { if (active) { load().then(scrollToEnd); } })
          .subscribe()
      : null;

    return () => { active = false; if (sub) { supabase.removeChannel(sub); } };
  }, [load, threadIds]));

  // Resolve (creating if needed) the 1:1 DM channel for composing.
  const ensureChannel = useCallback(async (): Promise<string | null> => {
    if (channelIdRef.current) { return channelIdRef.current; }
    if (!user) { return null; }
    try {
      const id = await ensurePrivateChannel(user.id, friendUserId);
      setChannelId(id);
      channelIdRef.current = id;
      return id;
    } catch { return null; }
  }, [user, friendUserId]);

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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.ACCENT_HOT} />}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No history yet</Text>
              <Text style={styles.emptySubtitle}>Share a Short or send a clip to start the conversation.</Text>
            </View>
          ) : (
            items.map(item => item.kind === 'share' ? (
              <TouchableOpacity
                key={item.key}
                style={styles.shareCard}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('Thread', { threadId: item.threadId })}>
                <View style={styles.shareThumb}>
                  {item.reacted && item.thumbnail ? (
                    <Image source={{ uri: item.thumbnail }} style={styles.shareThumbImg} />
                  ) : (
                    <View style={styles.shareThumbBlind}><Image source={questionmark} style={styles.shareThumbBlindImg} resizeMode="contain" /></View>
                  )}
                </View>
                <View style={styles.shareInfo}>
                  <Text style={styles.shareTitle} numberOfLines={2}>
                    {item.reacted ? item.title : 'Sent you a video to react to'}
                  </Text>
                  {item.reacted ? (
                    <Text style={styles.shareMeta}>✓ Reacted · tap to view</Text>
                  ) : (
                    <View style={styles.shareMetaRow}>
                      <DrippyEyes size={12} />
                      <Text style={styles.shareMeta}>Tap to react</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ) : (
              <ChannelMessageBubble
                key={item.key}
                post={item.post}
                isMe={item.post.poster_id === user?.id}
                userId={user?.id}
                onPress={() => navigation.navigate('WatchChannelClip', { postId: item.post.id })}
                onEmojiToggle={emoji => handleEmojiToggle(item.post, emoji)}
                onDelete={() => handleDeletePost(item.post.id)}
              />
            ))
          )}
        </ScrollView>
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

  // Video-share card in the timeline
  shareCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.LG, padding: SPACE.MD,
    borderWidth: 1, borderColor: C.BORDER,
  },
  shareThumb: { width: 64, height: 64, borderRadius: RADIUS.MD, overflow: 'hidden', backgroundColor: C.SURFACE_2 },
  shareThumbImg: { width: 64, height: 64 },
  shareThumbBlind: { width: 64, height: 64, backgroundColor: C.BLACK, alignItems: 'center', justifyContent: 'center' },
  shareThumbBlindImg: { width: 20, height: 28 },
  shareInfo: { flex: 1, gap: 4 },
  shareTitle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  shareMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shareMeta: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED },

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
