import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CameraWarmup from '../../lens/CameraWarmup';
import {
  View, Text, Image, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import YoutubePlayer from 'react-native-youtube-iframe';
import TikTokPlayer from '../../../components/TikTokPlayer';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { DEMO_MODE } from '../../../demo/demoMode';
import { useAuthStore } from '../../../store/authStore';
import { useBlockStore } from '../../../store/blockStore';
import { usePendingChannelReactionsStore } from '../../../store/pendingChannelReactionsStore';
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
import Ionicons from 'react-native-vector-icons/Ionicons';
import EmojiChips from '../../../components/EmojiChips';
import ReactionMenu from '../../../components/ReactionMenu';
import { QUICK_EMOJIS } from '../../../components/EmojiGlyph';
import Handle from '../../../components/Handle';
import ContentActions from '../../../components/ContentActions';
import { formatViews } from '../../../components/ViewBadge';
import { openProfile } from '../../../store/profileDrawerStore';
import { formatSourceType } from '../../../utils/sourceType';
import BunnyEmbedPlayer from '../../studio/components/BunnyEmbedPlayer';
import { recordView } from '../../../infrastructure/supabase/queries/views';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

type DlState = 'local' | 'downloading' | 'unavailable';

// Stable reference for the "no pending reactions" case — a fresh `[]` in the zustand
// selector would change identity every render and spin React into an infinite loop.
const NO_PENDING: ChannelPost[] = [];

// Exclusive watch — a 1:1 mirror of ChannelPostScreen, just in the exclusive space:
// same blind/reveal thumbnail, same reaction list (download/play/retry + emoji menu) and
// reviews tab. Differences are only navigational — recording the reaction/review jumps to
// the Channels stack (those recorders aren't registered here), and the main bunny video
// plays inline via BunnyEmbedPlayer. Reactions & reviews are visible to anyone who holds
// the collection (RLS), so there's no react-gate on the lists below.
export default function ExclusiveWatchScreen({ route, navigation }: FeedStackScreenProps<'ExclusiveWatch'>) {
  const { postId, channelId, title: titleParam, thumbnail: thumbParam, posterId } = route.params;
  const { user } = useAuthStore();
  const blocked = useBlockStore(s => s.blocked);
  const { top } = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { height } = useWindowDimensions();

  const [post, setPost] = useState<ChannelPost | null>(null);
  const [reactions, setReactions] = useState<ChannelPost[]>([]);
  // Optimistic just-recorded reactions (any source platform) — shown immediately,
  // playable from the local copy, until the server fetch includes them.
  const pendingReactions = usePendingChannelReactionsStore(s => s.byPost[postId] ?? NO_PENDING);
  const reconcilePending = usePendingChannelReactionsStore(s => s.reconcile);
  const allReactions = useMemo(
    () => [...reactions, ...pendingReactions.filter(p => !reactions.some(r => r.id === p.id))],
    [reactions, pendingReactions],
  );
  useEffect(() => {
    if (reactions.length) { reconcilePending(postId, reactions.map(r => r.id)); }
  }, [reactions, postId, reconcilePending]);
  const [reviews, setReviews] = useState<ChannelReview[]>([]);
  const [reviewsAllowed, setReviewsAllowed] = useState(true);
  const [reviewsEnabled, setReviewsEnabled] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [tab, setTab] = useState<'reactions' | 'reviews'>('reactions');
  const [ttThumb, setTtThumb] = useState<string | null>(null);  // fresh TikTok thumb
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);   // inline source playback (yt/tiktok/ig/fb)
  const [playBunny, setPlayBunny] = useState(false); // bunny source → BunnyEmbedPlayer overlay
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
      setOwnerId(settings.ownerId);
      setReviews(revs);
    } finally {
      if (mountedRef.current) { setLoading(false); }
    }
  }, [postId, channelId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // TikTok thumbnails expire — resolve a fresh one by video id.
  useEffect(() => {
    if (post?.source_type === 'tiktok' && post.yt_video_id) {
      resolveTikTokThumbnail(post.yt_video_id)
        .then(u => { if (u && mountedRef.current) { setTtThumb(u); } })
        .catch(() => {});
    }
  }, [post?.source_type, post?.yt_video_id]);

  // Download a clip from its (public) cloud URL, tracking status + progress.
  const runClipDownload = useCallback((id: string, url: string) => {
    if (activeDownloadsRef.current.has(id)) { return; }
    activeDownloadsRef.current.add(id);
    setDlState(prev => ({ ...prev, [id]: 'downloading' }));
    setDlPct(prev => ({ ...prev, [id]: 0 }));

    downloadChannelClip(id, url, (pct) => {
      if (mountedRef.current) { setDlPct(prev => ({ ...prev, [id]: pct })); }
    })
      .then(() => {
        activeDownloadsRef.current.delete(id);
        if (mountedRef.current) { setDlState(prev => ({ ...prev, [id]: 'local' })); }
      })
      .catch(() => {
        activeDownloadsRef.current.delete(id);
        if (mountedRef.current) { setDlState(prev => ({ ...prev, [id]: 'unavailable' })); }
      });
  }, []);

  // Manual retry for a clip whose cloud copy still exists but failed to download.
  const retryClip = useCallback((r: ChannelPost) => {
    if (r.video_url) { runClipDownload(r.id, r.video_url); }
  }, [runClipDownload]);

  // Kick off downloads for reactions that aren't cached yet
  useEffect(() => {
    if (!allReactions.length) { return; }

    if (DEMO_MODE) {
      const m: Record<string, DlState> = {};
      allReactions.forEach(r => { m[r.id] = 'local'; });
      setDlState(m);
      return;
    }

    const initial: Record<string, DlState> = {};
    allReactions.forEach(r => { initial[r.id] = 'unavailable'; });
    setDlState(initial);

    allReactions.forEach(r => {
      if (activeDownloadsRef.current.has(r.id)) { return; }
      hasLocalClip(r.id).then(cached => {
        if (!mountedRef.current) { return; }
        if (cached) {
          setDlState(prev => ({ ...prev, [r.id]: 'local' }));
          if (r.poster_id === user?.id && !r.video_url) {
            backfillChannelClipUpload(r.id, user.id, `file://${localPathForClip(r.id)}`).catch(() => {});
          }
          return;
        }
        if (r.video_url) { runClipDownload(r.id, r.video_url); }
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allReactions]);

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
      if (mine) { await removeChannelPostEmojiReaction(reactionId, user.id, emoji); }
      else { await addChannelPostEmojiReaction(reactionId, user.id, emoji); }
    } catch { load(); }

    setProcessing(prev => { const n = new Set(prev); n.delete(key); return n; });
  }, [user?.id, reactions, processing, load]);

  // The recorders live in the Channels stack — RLS lets awarded users react/review here too.
  const recordReaction = () => (navigation as any).navigate('Channels', { screen: 'WatchYouTubePost', params: { postId, channelId } });
  const recordReview = () => (navigation as any).navigate('Channels', { screen: 'RecordReview', params: { postId, channelId } });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT_HOT} />
        <TouchableOpacity style={[styles.backBtn, { top: top + SPACE.SM }]} onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.center, { gap: SPACE.MD }]}>
        <Text style={styles.muted}>This exclusive video isn’t available.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.handle}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  // Bunny auto-generates a thumbnail.jpg next to the HLS playlist — derive it from video_url
  // (https://{cdn}/{guid}/playlist.m3u8 → …/thumbnail.jpg) so a creator video with no custom
  // thumbnail still shows a poster instead of the ▶ placeholder.
  const bunnyThumb = post.source_type === 'bunny' && post.video_url?.includes('playlist.m3u8')
    ? post.video_url.replace('playlist.m3u8', 'thumbnail.jpg')
    : null;
  const thumbnail = post.source_type === 'tiktok'
    ? ttThumb  // stored TikTok URL is expired; use the freshly resolved one
    : (post.yt_video_thumbnail ?? thumbParam ?? bunnyThumb ??
      (post.source_type === 'youtube' && post.yt_video_id ? `https://img.youtube.com/vi/${post.yt_video_id}/hqdefault.jpg` : null));
  const isMe = post.poster_id === user?.id || (!!posterId && posterId === user?.id);
  const hasReacted = allReactions.some(r => r.poster_id === user?.id);
  const visReactions = allReactions.filter(r => !blocked.has(r.poster_id));
  // React-to-reveal: the source video is blinded until the viewer reacts (the creator sees it straight away).
  const obscured = !hasReacted && !isMe;
  const isOwner = (!!ownerId && ownerId === user?.id) || isMe;
  const showReviewsTab = reviewsEnabled || isOwner;
  const hasReviewed = reviews.some(r => r.reviewer_id === user?.id);
  const visReviews = reviews.filter(r => !blocked.has(r.reviewer_id));
  const canReview = reviewsAllowed && hasReacted && !isMe && !hasReviewed;
  const formattedSourceType = formatSourceType(post.source_type);
  const videoTitle = post.yt_video_title ?? titleParam ?? null;

  const thumbH = Math.max(240, height - 10 - tabBarHeight);
  const isFile = post.source_type === 'instagram' || post.source_type === 'facebook';
  const playableSource = post.source_type === 'bunny'
    ? true
    : isFile ? !!post.video_url : !!post.yt_video_id;
  const canPlay = !obscured && playableSource;
  const onPlay = () => {
    recordView('post', postId);
    if (post.source_type === 'bunny') { setPlayBunny(true); return; }
    setPlaying(true);
  };

  return (
    <View style={styles.container}>
      <CameraWarmup />
    <ScrollView bounces={false}>
      {/* Thumbnail / blind */}
      <View style={[styles.thumbWrap, { height: thumbH, width: '100%', marginTop: 0 }]}>
        {playing ? (
          <>
            {isFile ? (
              <Video source={{ uri: post.video_url! }} style={StyleSheet.absoluteFill} resizeMode="contain" controls paused={false} onEnd={() => setPlaying(false)} />
            ) : post.source_type === 'tiktok' ? (
              <TikTokPlayer videoId={post.yt_video_id as string} style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
            ) : (
              <YoutubePlayer height={thumbH} videoId={post.yt_video_id as string} play />
            )}
            <TouchableOpacity style={[styles.backBtn, { top: top + SPACE.SM, left: undefined, right: SPACE.MD }]} onPress={() => setPlaying(false)} hitSlop={8}>
              <Text style={styles.backIcon}>✕</Text>
            </TouchableOpacity>
          </>
        ) : (
        <>
        {obscured ? (
          // Tap the blind to start recording a reaction — reacting reveals the video.
          <TouchableOpacity style={styles.thumbBlind} activeOpacity={0.85} onPress={recordReaction}>
            <Image source={require('../../../assets/questionmark.png')} style={styles.thumbBlindImg} resizeMode="contain" />
          </TouchableOpacity>
        ) : thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}><Text style={styles.thumbIcon}>▶</Text></View>
        )}

        {/* Tap to play the source video (creator + anyone who's reacted). */}
        {canPlay && (
          <TouchableOpacity style={styles.watchOverlay} activeOpacity={0.85} onPress={onPlay}>
            <View style={styles.watchBtn}><Text style={styles.watchIcon}>▶</Text></View>
          </TouchableOpacity>
        )}

        {/* Overlay — same position for both states */}
        <View style={styles.blindOverlay}>
          <View style={styles.exclusiveRow}>
            <Ionicons name="diamond" size={11} color={C.ACCENT_HOT} />
            <Text style={styles.exclusiveNote}>Exclusive · only collection members see reactions &amp; reviews</Text>
          </View>
          <Text style={styles.posterHandle}>
            Posted by{' '}
            <Handle userId={post.poster_id} handle={post.poster?.handle ?? '?'} style={styles.handle} />
            {' · via '}{formattedSourceType}
          </Text>
          {obscured ? (
            <Text style={styles.videoTitleObscured}>React to reveal this video</Text>
          ) : videoTitle ? (
            <Text style={styles.videoTitle} numberOfLines={2}>{videoTitle}</Text>
          ) : null}
          {!isMe && (
            hasReacted ? (
              canReview ? (
                <TouchableOpacity style={styles.reviewBtn} activeOpacity={0.85} onPress={recordReview}>
                  <Text style={styles.reviewBtnText}>★ Leave a Review</Text>
                  <Text style={styles.reviewBtnSub}>A 60s clip sent straight to @{post.poster?.handle ?? 'the creator'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.reactedBadge}>
                  <Text style={styles.reactedText}>{hasReviewed ? 'Reacted ✓  ·  Review sent ★' : 'You Reacted ✓'}</Text>
                </View>
              )
            ) : (
              <TouchableOpacity style={styles.reactBtn} activeOpacity={0.85} onPress={recordReaction}>
                <Text style={styles.reactBtnText}>Record Your Reaction</Text>
              </TouchableOpacity>
            )
          )}
        </View>
        </>
        )}
      </View>

      {/* Reactions / Reviews */}
      <View>
        {showReviewsTab ? (
          <View style={styles.tabBar}>
            <TouchableOpacity style={[styles.tab, tab === 'reactions' && styles.tabActive]} onPress={() => setTab('reactions')} activeOpacity={0.8}>
              <Text style={[styles.tabTxt, tab === 'reactions' && styles.tabTxtActive]}>
                Reactions{visReactions.length ? ` ${visReactions.length}` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, tab === 'reviews' && styles.tabActive]} onPress={() => setTab('reviews')} activeOpacity={0.8}>
              <Text style={[styles.tabTxt, tab === 'reviews' && styles.tabTxtActive]}>
                Reviews{visReviews.length ? ` ${visReviews.length}` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.sectionTitle}>
            {visReactions.length === 0 ? 'No reactions yet' : `${visReactions.length} reaction${visReactions.length !== 1 ? 's' : ''}`}
          </Text>
        )}
      </View>

      {tab === 'reviews' && showReviewsTab ? (
        visReviews.length === 0 ? (
          <Text style={styles.emptyTabText}>No reviews yet</Text>
        ) : visReviews.map(rv => (
          <TouchableOpacity key={rv.id} style={styles.reactionCard} activeOpacity={0.8} onPress={() => navigation.navigate('WatchReview', { reviewId: rv.id })}>
            <View style={styles.reactionThumb}><Text style={styles.thumbPlayIcon}>★</Text></View>
            <View style={styles.reactionInfo}>
              <TouchableOpacity onPress={() => openProfile({ userId: rv.reviewer_id, handle: rv.reviewer?.handle })} hitSlop={8} activeOpacity={0.7}>
                <Text style={styles.reactionHandle}>@{rv.reviewer?.handle ?? '?'}</Text>
              </TouchableOpacity>
              {rv.duration ? <Text style={styles.reactionDuration}>{rv.duration}s review</Text> : null}
            </View>
          </TouchableOpacity>
        ))
      ) : visReactions.length === 0 && showReviewsTab ? (
        <Text style={styles.emptyTabText}>No reactions yet</Text>
      ) : (
      visReactions.map(r => {
        const state = dlState[r.id] ?? 'unavailable';
        const pct = dlPct[r.id] ?? 0;
        const canWatch = state === 'local';
        const expired = !r.video_url;
        const retryable = state === 'unavailable' && !expired;

        return (
          <ReactionMenu
            key={r.id}
            style={styles.reactionCard}
            emojis={QUICK_EMOJIS}
            mine={(r.emoji_reactions ?? []).filter(e => e.user_id === user?.id).map(e => e.emoji)}
            onPick={emoji => handleEmojiToggle(r.id, emoji)}
            onPress={canWatch
              ? () => navigation.navigate('WatchChannelClip', { postId: r.id })
              : retryable
              ? () => retryClip(r)
              : undefined}
            liftedStyle={styles.reactionLifted}>
            {openPicker => (<>
            <View style={[styles.reactionThumb, !canWatch && styles.reactionThumbDim]}>
              {canWatch && <Text style={styles.thumbPlayIcon}>▶</Text>}
              {state === 'downloading' && (
                <View style={styles.dlWrap}>
                  <ActivityIndicator color={C.ACCENT_HOT} size="small" />
                  {pct > 0 && <Text style={styles.dlPct}>{pct}%</Text>}
                </View>
              )}
              {state === 'unavailable' && (expired
                ? <Image source={require('../../../assets/lock.png')} style={styles.thumbLock} resizeMode="contain" />
                : <Text style={styles.thumbRetryIcon}>↻</Text>)}
            </View>

            <View style={styles.reactionInfo}>
              <TouchableOpacity onPress={() => openProfile({ userId: r.poster_id, handle: (r as any).user?.handle ?? r.poster?.handle })} hitSlop={8} activeOpacity={0.7}>
                <Text style={styles.reactionHandle}>@{(r as any).user?.handle ?? r.poster?.handle ?? '?'}</Text>
              </TouchableOpacity>
              {canWatch && (
                <View style={styles.reactionMeta}>
                  <Text style={styles.reactionDuration}>{r.duration}s reaction</Text>
                  {(r.view_count ?? 0) > 0 && (
                    <View style={styles.reactionViews}>
                      <Ionicons name="eye-outline" size={12} color={C.SUBTLE} />
                      <Text style={styles.reactionViewsTxt}>{formatViews(r.view_count ?? 0)}</Text>
                    </View>
                  )}
                </View>
              )}
              {state === 'downloading' && <Text style={styles.reactionStatus}>Downloading…</Text>}
              {state === 'unavailable' && (
                <Text style={[styles.reactionStatus, retryable && styles.reactionRetry]}>
                  {expired ? 'No longer available' : 'Tap to re-download'}
                </Text>
              )}
            </View>

            <View style={styles.reactionReacts}>
              {r.emoji_reactions.length > 0 && (
                <EmojiChips reactions={r.emoji_reactions} userId={user?.id} onToggle={emoji => handleEmojiToggle(r.id, emoji)} showAdd={false} />
              )}
              <TouchableOpacity onPress={openPicker} hitSlop={8} activeOpacity={0.7} style={styles.reactTrigger}>
                <Ionicons name="happy-outline" size={20} color={C.MUTED} />
              </TouchableOpacity>
            </View>
            </>)}
          </ReactionMenu>
        );
      })
      )}

      <View style={{ height: SPACE.XXXL }} />
    </ScrollView>

    {/* Floating back button over thumbnail */}
    <TouchableOpacity style={[styles.backBtn, { top: top + SPACE.SM }]} onPress={() => navigation.goBack()} hitSlop={8}>
      <Text style={styles.backIcon}>‹</Text>
    </TouchableOpacity>

    {/* Report / block this post (hidden when playing — that corner shows ✕ — and on your own post) */}
    {!playing && !isMe && (
      <View style={[styles.postMoreBtn, { top: top + SPACE.SM }]}>
        <ContentActions targetType="post" targetId={postId} targetUserId={post.poster_id} handle={post.poster?.handle} color={C.WHITE} size={20} />
      </View>
    )}

    {/* Bunny (creator) source video — full-screen overlay player. BunnyEmbedPlayer's container is
        flex:1, so it MUST be wrapped in an absolute-fill layer; rendered bare it collapses to ~0 height
        (sibling after the ScrollView) and the video never shows. */}
    {playBunny && (
      <View style={StyleSheet.absoluteFillObject}>
        <BunnyEmbedPlayer
          postId={postId}
          title={videoTitle ?? 'Exclusive'}
          onClose={() => setPlayBunny(false)}
          reportTargetId={postId}
          reportTargetUserId={post.poster_id}
          reportHandle={post.poster?.handle ?? null}
          reportTargetType="post"
        />
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  center: { flex: 1, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center' },
  muted: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  thumbWrap: { backgroundColor: C.BLACK, overflow: 'hidden' },
  watchOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  watchBtn: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)',
  },
  watchIcon: { color: C.WHITE, fontSize: 30, marginLeft: 4 },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.SURFACE_2 },
  thumbIcon: { fontSize: 48, color: C.SUBTLE },
  videoTitle: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK },
  posterHandle: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED },
  handle: { color: C.ACCENT_HOT, fontFamily: FONT.BODY_MEDIUM },
  exclusiveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  exclusiveNote: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM, color: C.ACCENT_HOT },
  reactBtn: { backgroundColor: C.ACCENT, borderRadius: RADIUS.MD, marginBottom: SPACE.LG, padding: SPACE.LG, alignItems: 'center' },
  reactBtnText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD },
  reactedBadge: { marginBottom: SPACE.LG, padding: SPACE.LG, borderRadius: RADIUS.MD, backgroundColor: C.SURFACE, alignItems: 'center' },
  reactedText: { color: C.MUTED, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  reviewBtn: { backgroundColor: C.ACCENT, borderRadius: RADIUS.MD, marginBottom: SPACE.LG, paddingVertical: SPACE.LG, paddingHorizontal: SPACE.LG, alignItems: 'center', gap: 2 },
  reviewBtnText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD },
  reviewBtnSub: { color: 'rgba(255,255,255,0.8)', fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY },
  tabBar: { flexDirection: 'row', gap: SPACE.SM, marginTop: SPACE.LG, paddingHorizontal: SPACE.LG, paddingBottom: SPACE.SM },
  tab: { paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS + 1, borderRadius: RADIUS.FULL, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE },
  tabActive: { backgroundColor: C.ACCENT_LITE, borderColor: C.ACCENT },
  tabTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  tabTxtActive: { color: C.ACCENT_HOT },
  emptyTabText: { color: C.MUTED, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD },
  sectionTitle: { fontSize: FONT.SIZES.SM, color: C.MUTED, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: SPACE.LG, paddingTop: SPACE.MD, paddingBottom: SPACE.XL },
  reactionCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD, paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD, borderTopWidth: 1, borderTopColor: C.BORDER },
  reactionThumb: { width: 56, height: 56, borderRadius: RADIUS.MD, backgroundColor: C.SURFACE_2, alignItems: 'center', justifyContent: 'center' },
  reactionThumbDim: { opacity: 0.9 },
  thumbPlayIcon: { fontSize: 20 },
  thumbLock: { width: 22, height: 32 },
  thumbRetryIcon: { fontSize: 24, color: C.ACCENT_HOT, fontWeight: '700' },
  dlWrap: { alignItems: 'center', gap: 2 },
  dlPct: { fontSize: 10, color: C.MUTED, fontFamily: FONT.BODY },
  reactionInfo: { flex: 1 },
  reactionReacts: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM },
  reactTrigger: { padding: 2 },
  reactionLifted: { backgroundColor: C.SURFACE_2, borderRadius: RADIUS.MD, borderTopWidth: 0 },
  reactionHandle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM, color: C.ACCENT_HOT },
  reactionDuration: { fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY },
  reactionMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, flexWrap: 'wrap' },
  reactionViews: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  reactionViewsTxt: { fontSize: FONT.SIZES.XS, color: C.SUBTLE, fontFamily: FONT.BODY },
  reactionStatus: { fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY, fontStyle: 'italic' },
  reactionRetry: { color: C.ACCENT_HOT, fontStyle: 'normal' },
  backBtn: { position: 'absolute', left: SPACE.MD, width: 36, height: 36, borderRadius: RADIUS.FULL, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: C.WHITE, fontSize: 26, lineHeight: 30, fontFamily: FONT.BODY },
  postMoreBtn: { position: 'absolute', right: SPACE.MD, width: 36, height: 36, borderRadius: RADIUS.FULL, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  thumbBlind: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: C.BLACK },
  thumbBlindImg: { width: 160, height: 200, opacity: 0.85 },
  blindOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.95)', paddingHorizontal: SPACE.LG, gap: SPACE.SM, paddingTop: SPACE.LG },
  videoTitleObscured: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic' },
});
