import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { supabase } from '../../../infrastructure/supabase/client';
import {
  fetchChannelPosts,
  fetchChannelPost,
  addChannelPostEmojiReaction,
  removeChannelPostEmojiReaction,
  joinChannel,
  leaveChannel,
  togglePinPost,
  type ChannelPost,
} from '../../../infrastructure/supabase/queries/channels';
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
  const [joiningLeaving, setJoiningLeaving] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
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

  // Keep postsRef in sync so handlers always read the latest pin state,
  // even if a re-render races with an in-flight toggle.
  useEffect(() => { postsRef.current = posts; }, [posts]);

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
  }, [isPublic, load]));
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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: top + SPACE.SM }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={8}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.channelName} numberOfLines={1}>{channelName}</Text>

        {isOwner && isPublic ? (
          <TouchableOpacity
            style={styles.postVideoBtn}
            onPress={() => navigation.navigate('AddChannelVideo', { channelId })}
            activeOpacity={0.8}>
            <Text style={styles.postVideoBtnText}>+ Video</Text>
          </TouchableOpacity>
        ) : isPublic ? (
          <TouchableOpacity
            style={[styles.joinBtn, joined && styles.joinBtnActive]}
            onPress={handleJoinLeave}
            disabled={joiningLeaving}
            activeOpacity={0.8}>
            <Text style={[styles.joinBtnText, joined && styles.joinBtnTextActive]}>
              {joiningLeaving ? '…' : joined ? 'Leave' : 'Join'}
            </Text>
          </TouchableOpacity>
        ) : (
          // Private channel — camera send button
          <TouchableOpacity
            style={styles.cameraBtn}
            onPress={() => navigation.navigate('ChannelVideoRecord', { channelId })}
            activeOpacity={0.8}>
            <Text style={styles.cameraBtnIcon}>📹</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.ACCENT_HOT} />
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={posts.length === 0 ? styles.emptyContainer : undefined}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={C.ACCENT_HOT}
            />
          }>
          {posts.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {isPublic ? 'No posts yet' : 'No messages yet — send a video!'}
              </Text>
            </View>
          ) : isPublic ? (
            posts.map(item => (
              <ChannelPostCard
                key={item.id}
                post={item}
                userId={user?.id}
                isOwner={isOwner}
                onTogglePin={() => handleTogglePin(item.id)}
                onPress={() => {
                  if (item.post_type === 'youtube') {
                    navigation.navigate('ChannelPost', {
                      postId: item.id,
                      channelId,
                      isJoined: joined,
                    });
                  } else {
                    navigation.navigate('WatchChannelClip', { postId: item.id });
                  }
                }}
                onEmojiToggle={emoji => handleEmojiToggle(item.id, emoji)}
              />
            ))
          ) : (
            // Private channel — message-style, oldest first (newest at bottom)
            [...posts].reverse().map(item => (
              <ChannelMessageBubble
                key={item.id}
                post={item}
                isMe={item.poster_id === user?.id}
                userId={user?.id}
                onPress={() => navigation.navigate('WatchChannelClip', { postId: item.id })}
                onEmojiToggle={emoji => handleEmojiToggle(item.id, emoji)}
              />
            ))
          )}
        </ScrollView>
      )}
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
  channelName: {
    flex: 1,
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
    color: C.MUTED,
    fontSize: FONT.SIZES.MD,
    fontFamily: FONT.BODY,
    textAlign: 'center',
  },
});
