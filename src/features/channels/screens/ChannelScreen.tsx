import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, Pressable, Image,
  ActivityIndicator, RefreshControl, TouchableOpacity, Modal, FlatList,
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
  addChannelPostEmojiReaction,
  removeChannelPostEmojiReaction,
  deleteChannelPost,
  joinChannel,
  leaveChannel,
  togglePinPost,
  postChannelAudio,
  type ChannelPost,
} from '../../../infrastructure/supabase/queries/channels';
import {
  startAudioRecording,
  stopAudioRecording,
  cancelAudioRecording,
} from '../../../infrastructure/native/audioRecorder';
import ChannelPostCard from '../components/ChannelPostCard';
import ChannelMessageBubble from '../components/ChannelMessageBubble';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

export default function ChannelScreen({
  route,
  navigation,
}: ChannelsStackScreenProps<'Channel'>) {
  const { channelId, channelName, isPublic, isJoined: isJoinedParam, isOwner } = route.params;
  const { user } = useAuthStore();
  const { top } = useSafeAreaInsets();

  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joined, setJoined] = useState(isJoinedParam);
  const [title, setTitle] = useState(channelName);
  const [membersVisible, setMembersVisible] = useState(false);
  const [members, setMembers] = useState<{ userId: string; handle: string }[]>([]);
  const [joiningLeaving, setJoiningLeaving] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [isHoldingMic, setIsHoldingMic] = useState(false);
  const [audioElapsed, setAudioElapsed] = useState(0);
  const audioTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pendingAudio, setPendingAudio] = useState<{ path: string; duration: number } | null>(null);
  const [sendingAudio, setSendingAudio] = useState(false);
  const mountedRef = useRef(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const postsRef = useRef<ChannelPost[]>([]);   // always-current snapshot for handlers
  const togglingRef = useRef(false);             // debounce guard against double-fire

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); }
    try {
      const data = await fetchChannelPosts(channelId);
      if (mountedRef.current) { setPosts(data); }
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

  // Silently reload whenever the screen comes back into focus — covers the case
  // where the user returns from ChannelVideoRecordScreen after posting a clip.
  // Private channels: reload + scroll to bottom when returning from recording.
  // Safe for public channels to skip — pin toggle relies on no reload-on-focus there.
  useFocusEffect(useCallback(() => {
    if (isPublic) { return; }
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
  }, [channelId, isPublic]);

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

  const handleTogglePin = useCallback(async (postId: string) => {
    // Debounce: ignore the second fire that React Native's touch system
    // emits when a component re-renders mid-press.
    if (togglingRef.current) { return; }
    togglingRef.current = true;

    // Read the CURRENT pin state from the ref, not from a stale closure.
    const currentPost = postsRef.current.find(p => p.id === postId);
    if (!currentPost) { togglingRef.current = false; return; }
    const currentlyPinned = currentPost.is_pinned;

    const sort = (arr: ChannelPost[]) =>
      [...arr].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) { return a.is_pinned ? -1 : 1; }
        return b.created_at.localeCompare(a.created_at);
      });

    setPosts(prev => sort(prev.map(p =>
      p.id === postId ? { ...p, is_pinned: !currentlyPinned } : p,
    )));

    try {
      await togglePinPost(postId, !currentlyPinned);
    } catch {
      setPosts(prev => sort(prev.map(p =>
        p.id === postId ? { ...p, is_pinned: currentlyPinned } : p,
      )));
    } finally {
      togglingRef.current = false;
    }
  }, []);

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
          <TouchableOpacity style={styles.postVideoBtn} activeOpacity={0.8}
            onPress={() => navigation.navigate('AddChannelVideo', { channelId })}>
            <Text style={styles.postVideoBtnText}>+ Video</Text>
          </TouchableOpacity>
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

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} /></View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            posts.length === 0 ? styles.emptyContainer : undefined,
            !isPublic ? styles.msgPad : undefined,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={C.ACCENT_HOT} />
          }>
          {posts.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {isPublic ? 'No posts yet' : 'No messages yet'}
              </Text>
            </View>
          ) : isPublic ? (
            posts.map(item => (
              <ChannelPostCard key={item.id} post={item} userId={user?.id}
                isOwner={isOwner} onTogglePin={() => handleTogglePin(item.id)}
                onPress={() => {
                  if (item.post_type === 'youtube') {
                    navigation.navigate('ChannelPost', { postId: item.id, channelId, isJoined: joined });
                  } else { navigation.navigate('WatchChannelClip', { postId: item.id }); }
                }}
                onEmojiToggle={emoji => handleEmojiToggle(item.id, emoji)} />
            ))
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
});
