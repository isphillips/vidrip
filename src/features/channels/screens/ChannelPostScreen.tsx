import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchChannelPost,
  fetchChannelPostReactions,
  addChannelPostEmojiReaction,
  removeChannelPostEmojiReaction,
  fetchPostReviews,
  fetchChannelReviewSettings,
  backfillChannelClipUpload,
  type ChannelPost,
  type ChannelReview,
} from '../../../infrastructure/supabase/queries/channels';
import {
  hasLocalClip,
  localPathForClip,
  downloadChannelClip,
} from '../../../infrastructure/storage/localChannelClipStorage';
import { resolveTikTokThumbnail } from '../../../infrastructure/tiktok/api';
import EmojiChips from '../../../components/EmojiChips';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

type DlState = 'local' | 'downloading' | 'unavailable';

export default function ChannelPostScreen({
  route, navigation,
}: ChannelsStackScreenProps<'ChannelPost'>) {
  const { postId, channelId, isJoined } = route.params;
  const { user } = useAuthStore();
  const { top } = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { height } = useWindowDimensions();

  const [post, setPost] = useState<ChannelPost | null>(null);
  const [reactions, setReactions] = useState<ChannelPost[]>([]);
  const [reviews, setReviews] = useState<ChannelReview[]>([]);
  const [reviewsAllowed, setReviewsAllowed] = useState(true);
  const [reviewsEnabled, setReviewsEnabled] = useState(false);
  const [inviteOnly, setInviteOnly] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [tab, setTab] = useState<'reactions' | 'reviews'>('reactions');
  // Height of the tabs/section block below the thumbnail — measured so the
  // thumbnail shrinks to land the poster/button overlay + tabs at the bottom.
  const [belowH, setBelowH] = useState(56);
  const [ttThumb, setTtThumb] = useState<string | null>(null);  // fresh TikTok thumb
  const [loading, setLoading] = useState(true);
  const [dlState, setDlState] = useState<Record<string, DlState>>({});
  const [dlPct, setDlPct] = useState<Record<string, number>>({});
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const activeDownloadsRef = useRef<Set<string>>(new Set());

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const [p, r, settings, revs] = await Promise.all([
        fetchChannelPost(postId),
        fetchChannelPostReactions(postId),
        fetchChannelReviewSettings(channelId),
        fetchPostReviews(postId),
      ]);
      if (!mountedRef.current) { return; }
      setPost(p);
      setReactions(r);
      setReviewsAllowed(settings.reviewsAllowed);
      setReviewsEnabled(settings.reviewsEnabled);
      setInviteOnly(settings.inviteOnly);
      setOwnerId(settings.ownerId);
      setReviews(revs);
    } finally {
      if (mountedRef.current) { setLoading(false); }
    }
  }, [postId, channelId]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // TikTok thumbnails expire — resolve a fresh one by video id.
  useEffect(() => {
    if (post?.source_type === 'tiktok' && post.yt_video_id) {
      resolveTikTokThumbnail(post.yt_video_id)
        .then(u => { if (u && mountedRef.current) { setTtThumb(u); } })
        .catch(() => {});
    }
  }, [post?.source_type, post?.yt_video_id]);

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
          // Recover older local-only clips: if this is my clip with no cloud URL,
          // upload it now so other devices/members can download it.
          if (r.poster_id === user?.id && !r.video_url) {
            backfillChannelClipUpload(r.id, user.id, `file://${localPathForClip(r.id)}`).catch(() => {});
          }
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

  // Invite-only room and you're not the owner or a member → no access.
  if (inviteOnly && ownerId !== user?.id && !isJoined) {
    return (
      <View style={[styles.center, { gap: SPACE.MD }]}>
        <Text style={styles.muted}>🔒 This room is invite only.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.handle}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const thumbnail = post.source_type === 'tiktok'
    ? ttThumb  // stored TikTok URL is expired; use the freshly resolved one
    : (post.yt_video_thumbnail ??
      (post.yt_video_id ? `https://img.youtube.com/vi/${post.yt_video_id}/hqdefault.jpg` : null));
  const hasReacted = reactions.some(r => r.poster_id === user?.id);
  const obscured = !hasReacted && post.poster_id !== user?.id;
  const isOwner = !!ownerId && ownerId === user?.id;
  const showReviewsTab = reviewsEnabled || isOwner;
  const hasReviewed = reviews.some(r => r.reviewer_id === user?.id);
  // You can review a post once you've reacted to it (and it isn't your own post),
  // and only if the creator allows reviews on this channel.
  const canReview = reviewsAllowed && isJoined && hasReacted && post.poster_id !== user?.id && !hasReviewed;

  return (
    <View style={styles.container}>
    <ScrollView bounces={false}>
      {/* Thumbnail / blind */}
      <View style={[styles.thumbWrap, { height: Math.max(240, height - belowH - tabBarHeight), width: '100%', marginTop: 0 }]}>
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
            {' · via '}{post.source_type === 'tiktok' ? 'TikTok' : 'YouTube'}
          </Text>
          {obscured ? (
            <Text style={styles.videoTitleObscured}>React to reveal this video</Text>
          ) : post.yt_video_title ? (
            <Text style={styles.videoTitle} numberOfLines={2}>{post.yt_video_title}</Text>
          ) : null}
          {isJoined && post.poster_id !== user?.id && (
            hasReacted ? (
              canReview ? (
                <TouchableOpacity style={styles.reviewBtn} activeOpacity={0.85}
                  onPress={() => navigation.navigate('RecordReview', { postId, channelId })}>
                  <Text style={styles.reviewBtnText}>★ Leave a Review</Text>
                  <Text style={styles.reviewBtnSub}>
                    A 60s clip sent straight to @{post.poster?.handle ?? 'the creator'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.reactedBadge}>
                  <Text style={styles.reactedText}>
                    {hasReviewed ? 'Reacted ✓  ·  Review sent ★' : 'You Reacted ✓'}
                  </Text>
                </View>
              )
            ) : (
              <TouchableOpacity style={styles.reactBtn} activeOpacity={0.85}
                onPress={() => navigation.navigate('WatchYouTubePost', { postId, channelId })}>
                <Text style={styles.reactBtnText}>Record Your Reaction</Text>
              </TouchableOpacity>
            )
          )}
        </View>
      </View>

      {/* Reactions / Reviews — measured so the thumbnail above sizes to land this
          block (and the overlay button) at the bottom on first render. */}
      <View onLayout={e => setBelowH(e.nativeEvent.layout.height)}>
        {showReviewsTab ? (
          <View style={styles.tabBar}>
            <TouchableOpacity style={[styles.tab, tab === 'reactions' && styles.tabActive]}
              onPress={() => setTab('reactions')} activeOpacity={0.8}>
              <Text style={[styles.tabTxt, tab === 'reactions' && styles.tabTxtActive]}>
                Reactions{reactions.length ? ` ${reactions.length}` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, tab === 'reviews' && styles.tabActive]}
              onPress={() => setTab('reviews')} activeOpacity={0.8}>
              <Text style={[styles.tabTxt, tab === 'reviews' && styles.tabTxtActive]}>
                Reviews{reviews.length ? ` ${reviews.length}` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.sectionTitle}>
            {reactions.length === 0
              ? 'No reactions yet'
              : `${reactions.length} reaction${reactions.length !== 1 ? 's' : ''}`}
          </Text>
        )}
      </View>

      {tab === 'reviews' && showReviewsTab ? (
        reviews.length === 0 ? (
          <Text style={styles.emptyTabText}>No reviews yet</Text>
        ) : reviews.map(rv => (
          <TouchableOpacity
            key={rv.id}
            style={styles.reactionCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('WatchReview', { reviewId: rv.id })}>
            <View style={styles.reactionThumb}>
              <Text style={styles.thumbPlayIcon}>★</Text>
            </View>
            <View style={styles.reactionInfo}>
              <Text style={styles.reactionHandle}>@{rv.reviewer?.handle ?? '?'}</Text>
              {rv.duration ? <Text style={styles.reactionDuration}>{rv.duration}s review</Text> : null}
            </View>
          </TouchableOpacity>
        ))
      ) : reactions.length === 0 && showReviewsTab ? (
        <Text style={styles.emptyTabText}>No reactions yet</Text>
      ) : (
      reactions.map(r => {
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
      })
      )}

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
  reviewBtn: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    marginBottom: SPACE.LG,
    paddingVertical: SPACE.MD,
    paddingHorizontal: SPACE.LG,
    alignItems: 'center',
    gap: 2,
  },
  reviewBtnText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD },
  reviewBtnSub: { color: 'rgba(255,255,255,0.8)', fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY },
  tabBar: {
    flexDirection: 'row', gap: SPACE.SM, marginTop: SPACE.LG,
    paddingHorizontal: SPACE.LG, paddingBottom: SPACE.SM,
  },
  tab: {
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS + 1,
    borderRadius: RADIUS.FULL, borderWidth: 1, borderColor: C.BORDER,
    backgroundColor: C.SURFACE,
  },
  tabActive: { backgroundColor: C.ACCENT_LITE, borderColor: C.ACCENT },
  tabTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  tabTxtActive: { color: C.ACCENT_HOT },
  emptyTabText: {
    color: C.MUTED, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD,
  },
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
