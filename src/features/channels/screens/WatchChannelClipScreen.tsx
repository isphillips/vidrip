import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, Platform,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSequence, withSpring,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';
import Video from 'react-native-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { supabase } from '../../../infrastructure/supabase/client';
import {
  fetchChannelPost,
  addChannelPostEmojiReaction,
  removeChannelPostEmojiReaction,
  type ChannelPost,
} from '../../../infrastructure/supabase/queries/channels';
import {
  hasLocalClip,
  localPathForClip,
  downloadChannelClip,
  hasLocalAudio,
  localPathForAudio,
} from '../../../infrastructure/storage/localChannelClipStorage';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

const QUICK_EMOJIS = ['❤️', '😂', '😮', '🔥', '👏', '😭'];

function EmojiBtn({
  emoji, count, isMine, isDisabled, onPress,
}: {
  emoji: string; count: number; isMine: boolean;
  isDisabled: boolean; onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(1.28, { damping: 5, stiffness: 600 }),
      withSpring(1, { damping: 14, stiffness: 400 }),
    );
    onPress();
  };

  return (
    <Pressable onPress={handlePress} disabled={isDisabled}>
      <Animated.View style={[styles.emojiBtn, isMine && styles.emojiBtnActive, animStyle]}>
        <Text style={styles.emojiGlyph}>{emoji}</Text>
        {count > 0 && (
          <Text style={[styles.emojiCount, isMine && styles.emojiCountActive]}>{count}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

export default function WatchChannelClipScreen({
  route,
  navigation,
}: ChannelsStackScreenProps<'WatchChannelClip'>) {
  const { postId } = route.params;
  const { user } = useAuthStore();
  const { width, height } = useWindowDimensions();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();

  type LoadState = 'loading' | 'downloading' | 'ready' | 'unavailable';

  const [post, setPost] = useState<ChannelPost | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [downloadPct, setDownloadPct] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const videoRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const p = await fetchChannelPost(postId).catch(() => null);
      if (!p) { setLoadState('unavailable'); return; }
      setPost(p);

      const isAudio = p.post_type === 'audio';

      // Audio posts are always local — no cloud URL
      if (isAudio) {
        if (await hasLocalAudio(postId)) {
          const path = localPathForAudio(postId);
          setLocalUri(Platform.OS === 'ios' ? path : `file://${path}`);
          setLoadState('ready');
        } else {
          setLoadState('unavailable');
        }
        return;
      }

      if (!p.video_url) { setLoadState('unavailable'); return; }

      // Check local cache first — prefer local copy over streaming
      if (await hasLocalClip(postId)) {
        const path = localPathForClip(postId);
        setLocalUri(Platform.OS === 'ios' ? path : `file://${path}`);
        setLoadState('ready');
        return;
      }

      // Download to device then play
      setLoadState('downloading');
      try {
        const dest = await downloadChannelClip(postId, p.video_url, setDownloadPct);
        setLocalUri(Platform.OS === 'ios' ? dest : `file://${dest}`);
        setLoadState('ready');
      } catch {
        setLoadState('unavailable');
      }
    })();
  }, [postId]);

  // Realtime emoji updates
  useEffect(() => {
    if (!post) { return; }
    const channel = (supabase as any)
      .channel(`cper-clip:${postId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'channel_post_emoji_reactions',
        filter: `post_id=eq.${postId}`,
      }, () => {
        (supabase as any)
          .from('channel_post_emoji_reactions')
          .select('emoji, user_id')
          .eq('post_id', postId)
          .then(({ data }: any) => {
            if (data) { setPost(p => p ? { ...p, emoji_reactions: data } : p); }
          });
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [postId, post?.id]);

  const handleEmojiPress = useCallback(async (emoji: string) => {
    if (!post || !user?.id || processing.has(emoji)) { return; }
    const mine = post.emoji_reactions.find(r => r.emoji === emoji && r.user_id === user.id);

    setProcessing(prev => new Set([...prev, emoji]));
    setPost(p => {
      if (!p) { return p; }
      return {
        ...p,
        emoji_reactions: mine
          ? p.emoji_reactions.filter(r => !(r.emoji === emoji && r.user_id === user.id))
          : [...p.emoji_reactions, { emoji, user_id: user.id! }],
      };
    });

    try {
      if (mine) {
        await removeChannelPostEmojiReaction(post.id, user.id, emoji);
      } else {
        await addChannelPostEmojiReaction(post.id, user.id, emoji);
      }
    } catch { /* realtime will reconcile */ }

    setProcessing(prev => { const n = new Set(prev); n.delete(emoji); return n; });
  }, [post, user?.id, processing]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  if (loadState === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT_HOT} size="large" />
      </View>
    );
  }

  if (loadState === 'downloading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT_HOT} size="large" />
        <Text style={styles.downloadText}>Downloading to your device…</Text>
        {downloadPct > 0 && (
          <View style={styles.progressWrap}>
            <View style={[styles.progressBarDl, { width: `${downloadPct}%` as any }]} />
          </View>
        )}
        {downloadPct > 0 && <Text style={styles.downloadPct}>{downloadPct}%</Text>}
      </View>
    );
  }

  if (loadState === 'unavailable' || !localUri) {
    return (
      <View style={styles.center}>
        <Text style={styles.unavailText}>Video unavailable</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.goBack}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalDuration = duration || (post.duration ?? 0);
  const progressPct = totalDuration > 0 ? Math.min((progress / totalDuration) * 100, 100) : 0;
  const counts = (post.emoji_reactions ?? []).reduce((acc: Record<string, number>, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      {/* Full-screen video — tap to play/pause */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={() => setPaused(p => !p)}>
        <Video
          ref={videoRef}
          source={{ uri: localUri }}
          style={{ width, height }}
          resizeMode="contain"
          paused={paused}
          audioOnly={post?.post_type === 'audio'}
          onLoad={(d: any) => setDuration(d.duration)}
          onProgress={(d: any) => setProgress(d.currentTime)}
          onEnd={() => { setPaused(true); setProgress(0); videoRef.current?.seek(0); }}
          repeat={false}
        />
      </TouchableOpacity>

      {/* Pause indicator */}
      {paused && (
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playCircle}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>
      )}

      {/* Info bar */}
      <View style={[styles.infoBar, { top: topInset + SPACE.SM }]} pointerEvents="none">
        <Text style={styles.handle}>@{post.poster?.handle ?? '?'}</Text>
        <Text style={styles.timer}>{fmt(progress)} / {fmt(totalDuration)}</Text>
      </View>

      {/* Emoji drawer — 😊 toggle hidden for own posts, reactions always visible */}
      <View style={[styles.emojiDrawer, { right: SPACE.MD, bottom: bottomInset + SPACE.LG }]}>
        {emojiOpen && (
          <View style={styles.emojiList}>
            {QUICK_EMOJIS.map(emoji => (
              <EmojiBtn
                key={emoji}
                emoji={emoji}
                count={counts[emoji] ?? 0}
                isMine={post.emoji_reactions.some(r => r.emoji === emoji && r.user_id === user?.id)}
                isDisabled={post.poster_id === user?.id || processing.has(emoji)}
                onPress={() => handleEmojiPress(emoji)}
              />
            ))}
          </View>
        )}
        <TouchableOpacity
          style={[styles.emojiToggle, emojiOpen && styles.emojiToggleOpen]}
          onPress={() => setEmojiOpen(o => !o)}
          activeOpacity={0.8}>
          <Text style={styles.emojiToggleIcon}>{emojiOpen ? '✕' : '😊'}</Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack} pointerEvents="none">
        <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
      </View>

      {/* Close */}
      <TouchableOpacity
        style={[styles.closeBtn, { top: topInset + SPACE.SM }]}
        onPress={() => navigation.goBack()}>
        <Text style={styles.closeTxt}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BLACK },
  center: {
    flex: 1, backgroundColor: C.BLACK,
    alignItems: 'center', justifyContent: 'center', gap: SPACE.MD,
  },
  unavailText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  goBack: { color: C.ACCENT_HOT, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM },
  downloadText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  downloadPct: { color: C.SUBTLE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  progressWrap: {
    width: 180, height: 4, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden',
  },
  progressBarDl: { height: 4, backgroundColor: C.ACCENT_HOT, borderRadius: RADIUS.FULL },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playCircle: {
    width: 72, height: 72, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  playIcon: { color: C.WHITE, fontSize: 26, marginLeft: 5 },
  infoBar: {
    position: 'absolute', left: SPACE.LG, right: SPACE.LG,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  handle: {
    color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  timer: {
    color: 'rgba(255,255,255,0.8)', fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  emojiDrawer: { position: 'absolute', alignItems: 'center', gap: SPACE.SM },
  emojiList: { alignItems: 'center', gap: SPACE.SM, marginBottom: SPACE.SM },
  emojiToggle: {
    width: 44, height: 44, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  emojiToggleOpen: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  emojiToggleIcon: { fontSize: 22 },
  emojiBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: RADIUS.FULL,
    width: 52, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    gap: 2,
  },
  emojiBtnActive: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'transparent' },
  emojiGlyph: { fontSize: 24 },
  emojiCount: { color: 'rgba(255,255,255,0.6)', fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY },
  emojiCountActive: { color: C.WHITE, fontFamily: FONT.BODY_BOLD },
  progressTrack: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 3, backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressFill: { height: 3, backgroundColor: C.ACCENT_HOT },
  closeBtn: {
    position: 'absolute', right: SPACE.LG,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: C.WHITE, fontSize: 16, fontFamily: FONT.BODY_BOLD, lineHeight: 20 },
});
