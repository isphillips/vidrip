import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchChannelPost,
  fetchChannelPostReactions,
  addChannelPostEmojiReaction,
  removeChannelPostEmojiReaction,
  type ChannelPost,
} from '../../../infrastructure/supabase/queries/channels';
import {
  hasLocalClip,
  downloadChannelClip,
} from '../../../infrastructure/storage/localChannelClipStorage';
import EmojiChips from '../../../components/EmojiChips';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

type DlState = 'local' | 'downloading' | 'unavailable';

export default function ChannelPostScreen({
  route, navigation,
}: ChannelsStackScreenProps<'ChannelPost'>) {
  const { postId, channelId, isJoined } = route.params;
  const { user } = useAuthStore();
  const { top } = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [post, setPost] = useState<ChannelPost | null>(null);
  const [reactions, setReactions] = useState<ChannelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlState, setDlState] = useState<Record<string, DlState>>({});
  const [dlPct, setDlPct] = useState<Record<string, number>>({});
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const activeDownloadsRef = useRef<Set<string>>(new Set());

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        fetchChannelPost(postId),
        fetchChannelPostReactions(postId),
      ]);
      if (!mountedRef.current) { return; }
      setPost(p);
      setReactions(r);
    } finally {
      if (mountedRef.current) { setLoading(false); }
    }
  }, [postId]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Kick off downloads for reactions that aren't cached yet
  useEffect(() => {
    if (!reactions.length) { return; }

    const initial: Record<string, DlState> = {};
    reactions.forEach(r => { initial[r.id] = 'unavailable'; });
    setDlState(initial);

    reactions.forEach(r => {
      if (activeDownloadsRef.current.has(r.id)) { return; }

      hasLocalClip(r.id).then(cached => {
        if (!mountedRef.current) { return; }
        if (cached) {
          setDlState(prev => ({ ...prev, [r.id]: 'local' }));
          return;
        }
        // No local copy — try cloud URL if available
        if (!r.video_url) { return; }

        activeDownloadsRef.current.add(r.id);
        setDlState(prev => ({ ...prev, [r.id]: 'downloading' }));

        downloadChannelClip(r.id, r.video_url, (pct) => {
          if (mountedRef.current) { setDlPct(prev => ({ ...prev, [r.id]: pct })); }
        })
          .then(() => {
            activeDownloadsRef.current.delete(r.id);
            if (mountedRef.current) {
              setDlState(prev => ({ ...prev, [r.id]: 'local' }));
            }
          })
          .catch(() => {
            activeDownloadsRef.current.delete(r.id);
            if (mountedRef.current) {
              setDlState(prev => ({ ...prev, [r.id]: 'unavailable' }));
            }
          });
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactions]);

  const handleEmojiToggle = useCallback(async (reactionId: string, emoji: string) => {
    if (!user?.id) { return; }
    const reaction = reactions.find(r => r.id === reactionId);
    if (!reaction) { return; }
    const mine = reaction.emoji_reactions?.find(e => e.emoji === emoji && e.user_id === user.id);
    const key = `${reactionId}:${emoji}`;
    if (processing.has(key)) { return; }

    setProcessing(prev => new Set([...prev, key]));
    setReactions(prev => prev.map(r =>
      r.id !== reactionId ? r : {
        ...r,
        emoji_reactions: mine
          ? r.emoji_reactions.filter(e => !(e.emoji === emoji && e.user_id === user.id))
          : [...(r.emoji_reactions ?? []), { emoji, user_id: user.id! }],
      },
    ));

    try {
      if (mine) {
        await removeChannelPostEmojiReaction(reactionId, user.id, emoji);
      } else {
        await addChannelPostEmojiReaction(reactionId, user.id, emoji);
      }
    } catch { load(); }

    setProcessing(prev => { const n = new Set(prev); n.delete(key); return n; });
  }, [user?.id, reactions, processing, load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} /></View>;
  }

  if (!post) {
    return <View style={styles.center}><Text style={styles.muted}>Post not found</Text></View>;
  }

  const thumbnail = post.yt_video_thumbnail ??
    (post.yt_video_id ? `https://img.youtube.com/vi/${post.yt_video_id}/hqdefault.jpg` : null);
  const hasReacted = reactions.some(r => r.poster_id === user?.id);
  const obscured = !hasReacted && post.poster_id !== user?.id;

  return (
    <View style={styles.container}>
    <ScrollView bounces={false}>
      {/* Thumbnail / blind */}
      <View style={[styles.thumbWrap, { height: height - 113, width: '100%', marginTop: 0 }]}>
        {obscured ? (
          <View style={styles.thumbBlind}>
            <Image source={require('../../../assets/questionmark.png')} style={styles.thumbBlindImg} resizeMode="contain" />
          </View>
        ) : thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Text style={styles.thumbIcon}>▶</Text>
          </View>
        )}

        {/* Overlay — same position for both states */}
        <View style={styles.blindOverlay}>
          <Text style={styles.posterHandle}>
            Posted by <Text style={styles.handle}>@{post.poster?.handle ?? '?'}</Text>
          </Text>
          {obscured ? (
            <Text style={styles.videoTitleObscured}>React to reveal this video</Text>
          ) : post.yt_video_title ? (
            <Text style={styles.videoTitle} numberOfLines={2}>{post.yt_video_title}</Text>
          ) : null}
          {isJoined && (
            hasReacted ? (
              <View style={styles.reactedBadge}>
                <Text style={styles.reactedText}>You Reacted ✓</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.reactBtn} activeOpacity={0.85}
                onPress={() => navigation.navigate('WatchYouTubePost', { postId, channelId })}>
                <Text style={styles.reactBtnText}>Record Your Reaction</Text>
              </TouchableOpacity>
            )
          )}
        </View>
      </View>

      {/* Reactions list */}
      <Text style={styles.sectionTitle}>
        {reactions.length === 0
          ? 'No reactions yet'
          : `${reactions.length} reaction${reactions.length !== 1 ? 's' : ''}`}
      </Text>

      {reactions.map(r => {
        const state = dlState[r.id] ?? 'unavailable';
        const pct = dlPct[r.id] ?? 0;
        const canWatch = state === 'local';

        return (
          <TouchableOpacity
            key={r.id}
            style={styles.reactionCard}
            activeOpacity={canWatch ? 0.8 : 1}
            onPress={canWatch ? () => navigation.navigate('WatchChannelClip', { postId: r.id }) : undefined}>

            <View style={[styles.reactionThumb, !canWatch && styles.reactionThumbDim]}>
              {canWatch && <Text style={styles.thumbPlayIcon}>▶</Text>}
              {state === 'downloading' && (
                <View style={styles.dlWrap}>
                  <ActivityIndicator color={C.ACCENT_HOT} size="small" />
                  {pct > 0 && <Text style={styles.dlPct}>{pct}%</Text>}
                </View>
              )}
              {state === 'unavailable' && <Text style={styles.thumbPlayIcon}>🔒</Text>}
            </View>

            <View style={styles.reactionInfo}>
              <Text style={styles.reactionHandle}>@{(r.user as any)?.handle ?? r.poster?.handle ?? '?'}</Text>
              {canWatch && <Text style={styles.reactionDuration}>{r.duration}s reaction</Text>}
              {state === 'downloading' && <Text style={styles.reactionStatus}>Downloading…</Text>}
              {state === 'unavailable' && <Text style={styles.reactionStatus}>Unavailable</Text>}
            </View>

            <EmojiChips
              reactions={r.emoji_reactions}
              userId={user?.id}
              onToggle={emoji => handleEmojiToggle(r.id, emoji)}
            />
          </TouchableOpacity>
        );
      })}

      <View style={{ height: SPACE.XXXL }} />
    </ScrollView>

    {/* Floating back button over thumbnail */}
    <TouchableOpacity
      style={[styles.backBtn, { top: top + SPACE.SM }]}
      onPress={() => navigation.goBack()}
      hitSlop={8}>
      <Text style={styles.backIcon}>‹</Text>
    </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  center: { flex: 1, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center' },
  muted: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  thumbWrap: { backgroundColor: C.BLACK, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.SURFACE_2 },
  thumbIcon: { fontSize: 48, color: C.SUBTLE },
  meta: { padding: SPACE.LG, gap: SPACE.XS },
  videoTitle: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK },
  posterHandle: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED },
  handle: { color: C.ACCENT_HOT, fontFamily: FONT.BODY_MEDIUM },
  reactBtn: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    marginBottom: SPACE.LG,
    padding: SPACE.LG,
    alignItems: 'center',
  },
  reactBtnText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD },
  reactedBadge: {
    marginBottom: SPACE.LG,
    padding: SPACE.MD,
    borderRadius: RADIUS.MD,
    backgroundColor: C.SURFACE,
    alignItems: 'center',
  },
  reactedText: { color: C.MUTED, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  sectionTitle: {
    fontSize: FONT.SIZES.SM, color: C.MUTED,
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: SPACE.LG, marginBottom: SPACE.SM,
    paddingBottom: SPACE.SM,
  },
  reactionCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD,
    borderTopWidth: 1, borderTopColor: C.BORDER,
  },
  reactionThumb: {
    width: 56, height: 56, borderRadius: RADIUS.MD,
    backgroundColor: C.SURFACE_2,
    alignItems: 'center', justifyContent: 'center',
  },
  reactionThumbDim: { opacity: 0.5 },
  thumbPlayIcon: { fontSize: 20 },
  dlWrap: { alignItems: 'center', gap: 2 },
  dlPct: { fontSize: 10, color: C.MUTED, fontFamily: FONT.BODY },
  reactionInfo: { flex: 1 },
  reactionHandle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM, color: C.INK },
  reactionDuration: { fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY },
  reactionStatus: { fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY, fontStyle: 'italic' },
  backBtn: {
    position: 'absolute', left: SPACE.MD,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: C.WHITE, fontSize: 26, lineHeight: 30, fontFamily: FONT.BODY },
  thumbBlind: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.BLACK,
  },
  thumbBlindIcon: { fontSize: 80, color: 'rgba(255,255,255,0.35)', fontWeight: '700', fontFamily: FONT.DISPLAY_SEMIBOLD },
  thumbBlindImg: { width: 160, height: 200, opacity: 0.85 },
  blindOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.BG,
    paddingHorizontal: SPACE.LG, gap: SPACE.SM, paddingTop: SPACE.LG,
  },
  videoTitleObscured: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic' },
});
