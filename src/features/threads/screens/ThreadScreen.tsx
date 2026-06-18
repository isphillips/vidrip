import React, { useCallback, useEffect, useRef, useState } from 'react';
import CameraWarmup from '../../lens/CameraWarmup';
import EmojiChips from '../../../components/EmojiChips';
import Handle from '../../../components/Handle';
import { openProfile } from '../../../store/profileDrawerStore';
import { formatSourceType } from '../../../utils/sourceType';

// Alias so existing JSX (<ReactionEmojiChips>) keeps working without a rename
const ReactionEmojiChips = EmojiChips;
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { useBlockStore } from '../../../store/blockStore';
import { usePendingReactionsStore } from '../../../store/pendingReactionsStore';
import { useUploadStore } from '../../../store/uploadStore';
import { useIntroSeenStore } from '../../../store/introSeenStore';
import IntroPreroll from '../components/IntroPreroll';
import {
  fetchThread,
  fetchReactions,
  markThreadSeen,
  type ThreadDetail,
  type ReactionItem,
} from '../../../infrastructure/supabase/queries/threads';
import {
  downloadAndCache,
  recordReactionDownload,
  resolveReactionUri,
} from '../../../infrastructure/storage/reactionStorage';
import {
  addEmojiReaction,
  removeEmojiReaction,
} from '../../../infrastructure/supabase/queries/reactions';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

type DlStatus = 'local' | 'downloading' | 'unavailable';

export default function ThreadScreen({ route, navigation }: FeedStackScreenProps<'Thread'>) {
  const { threadId } = route.params;
  const { user } = useAuthStore();
  const blocked = useBlockStore(s => s.blocked);
  const { top } = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [reactions, setReactions] = useState<ReactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Optimistic, just-recorded reactions awaiting their relay upload.
  const pendingReactions = usePendingReactionsStore(s => s.pending);
  const reconcilePending = usePendingReactionsStore(s => s.reconcile);
  // Sender intro: play it once per session before the recipient sees the video.
  const introSeen = useIntroSeenStore(s => s.seen);
  const markIntroSeen = useIntroSeenStore(s => s.markSeen);
  const [dlStatus, setDlStatus] = useState<Record<string, DlStatus>>({});
  const [dlPct, setDlPct] = useState<Record<string, number>>({});
  const mountedRef = useRef(true);
  const activeDownloadsRef = useRef<Set<string>>(new Set());

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const load = useCallback(async () => {
    if (!user) { return; }
    try {
      const [t, r] = await Promise.all([
        fetchThread(threadId, user.id),
        fetchReactions(threadId),
      ]);
      if (!mountedRef.current) { return; }
      setThread(t);
      setReactions(r);
      // Drop optimistic copies that have now landed server-side.
      reconcilePending(r.map(x => x.id));
      if (t?.my_status === 'pending') { markThreadSeen(threadId); }
    } finally {
      if (mountedRef.current) { setLoading(false); }
    }
  }, [threadId, user, reconcilePending]);

  const handleEmojiToggle = useCallback(async (reactionId: string, emoji: string) => {
    if (!user?.id) { return; }
    const reaction = reactions.find(r => r.id === reactionId);
    if (!reaction) { return; }
    const myMatch = reaction.emoji_reactions?.find(
      e => e.emoji === emoji && e.user_id === user.id,
    );
    if (myMatch) {
      setReactions(prev => prev.map(r =>
        r.id === reactionId
          ? { ...r, emoji_reactions: r.emoji_reactions.filter(e => !(e.emoji === emoji && e.user_id === user.id)) }
          : r,
      ));
      await removeEmojiReaction(reactionId, user.id, emoji).catch(() => load());
    } else {
      const tempId = `tmp-${Date.now()}`;
      setReactions(prev => prev.map(r =>
        r.id === reactionId
          ? { ...r, emoji_reactions: [...(r.emoji_reactions ?? []), { id: tempId, emoji, user_id: user.id! }] }
          : r,
      ));
      await addEmojiReaction(reactionId, user.id, emoji).catch(() => load());
    }
  }, [user?.id, reactions, load]);

  // useFocusEffect fires on the initial (focused) mount and on every refocus, so a
  // separate mount-only useEffect would double the thread+reactions fetch on first open.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Refetch the moment a background upload finishes, so a just-posted reaction
  // becomes visible as soon as its relay upload completes — no close/reopen.
  const uploadJobs = useUploadStore(s => s.jobs);
  const prevUploadingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const nowUploading = new Set(uploadJobs.filter(j => j.status === 'uploading').map(j => j.id));
    let finished = false;
    prevUploadingRef.current.forEach(id => { if (!nowUploading.has(id)) { finished = true; } });
    prevUploadingRef.current = nowUploading;
    if (finished) { load(); }
  }, [uploadJobs, load]);

  // Download a reaction from a resolved cloud URL, tracking status + progress.
  const runDownload = useCallback((id: string, uri: string) => {
    if (activeDownloadsRef.current.has(id)) { return; }
    activeDownloadsRef.current.add(id);
    setDlStatus(prev => ({ ...prev, [id]: 'downloading' }));
    setDlPct(prev => ({ ...prev, [id]: 0 }));

    downloadAndCache(id, uri, (pct) => {
      if (mountedRef.current) { setDlPct(prev => ({ ...prev, [id]: pct })); }
    })
      .then(() => {
        activeDownloadsRef.current.delete(id);
        if (!mountedRef.current) { return; }
        setDlStatus(prev => ({ ...prev, [id]: 'local' }));
        setDlPct(prev => ({ ...prev, [id]: 100 }));
        if (user?.id) { recordReactionDownload(id, user.id).catch(() => {}); }
      })
      .catch(() => {
        activeDownloadsRef.current.delete(id);
        if (mountedRef.current) { setDlStatus(prev => ({ ...prev, [id]: 'unavailable' })); }
      });
  }, [user?.id]);

  // Manual retry: a reaction whose cloud copy still exists (video_url) but failed
  // to download. Re-resolve a FRESH signed URL (the cached one may have expired).
  const retryDownload = useCallback(async (r: ReactionItem) => {
    if (!r.video_url || activeDownloadsRef.current.has(r.id)) { return; }
    const resolved = await resolveReactionUri(r);
    if (resolved?.uri) { runDownload(r.id, resolved.uri); }
  }, [runDownload]);

  // Auto-download all cloud reactions when thread loads — messages inbox model
  useEffect(() => {
    if (!reactions.length) { return; }

    const initialStatuses: Record<string, DlStatus> = {};
    reactions.forEach(r => {
      initialStatuses[r.id] = r.resolvedUri && !r.needsDownload ? 'local' : 'unavailable';
    });
    setDlStatus(initialStatuses);

    reactions.forEach(r => {
      if (r.needsDownload && r.resolvedUri) { runDownload(r.id, r.resolvedUri); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactions]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.ACCENT} /></View>;
  }

  if (!thread) {
    return <View style={styles.center}><Text style={styles.errorText}>Thread not found</Text></View>;
  }

  // App-wide block: drop reactions from a blocked user (their poster id is on r.user.id).
  const visibleReactions = reactions.filter(r => !blocked.has((r.user as any)?.id));
  // Fold in optimistic reactions for this thread (own just-posted, upload in-flight).
  const pendingForThread = pendingReactions.filter(
    p => p.thread_id === threadId && !reactions.some(r => r.id === p.id),
  );
  const displayReactions = pendingForThread.length
    ? [...visibleReactions, ...pendingForThread]
    : visibleReactions;

  const isSender = thread.sender_id === user?.id;

  // If this share carries a sender intro, a recipient sees it full-screen the
  // moment they open the video — then it reveals the thread. Once per session
  // (shared introSeenStore), so it doesn't replay when they then record/watch.
  if (!isSender && thread.intro_url && !introSeen.has(threadId)) {
    return (
      <IntroPreroll
        introUrl={thread.intro_url}
        onDone={() => markIntroSeen(threadId)}
      />
    );
  }

  // pendingForThread is always this device's own just-recorded reaction, so it
  // also flips the CTA to "You Reacted" before the server status catches up.
  const hasReacted = thread.my_status === 'reacted' || pendingForThread.length > 0;
  const canReact = !isSender && !hasReacted;
  const obscured = canReact;
  const thumbnail = thread.video_thumbnail ??
    (thread.source_type === 'youtube' ? `https://img.youtube.com/vi/${thread.video_id}/hqdefault.jpg` : null);

  return (
    <View style={styles.container}>
      <CameraWarmup />
    <ScrollView bounces={false}>
      {/* Thumbnail / blind — full height with bottom overlay */}
      <View style={[styles.thumbWrap, { height: height - 113, width: '100%' }]}>
        {obscured ? (
          <View style={styles.thumbBlind}>
            <Image source={require('../../../assets/questionmark.png')} style={styles.thumbBlindImg} resizeMode="contain" />
          </View>
        ) : (
          <Image source={{ uri: thumbnail ?? undefined }} style={styles.thumb} resizeMode="cover" />
        )}

        {/* Overlay — same position for both states */}
        <View style={styles.blindOverlay}>
          <Text style={styles.posterHandle}>
            Shared by {isSender ? <Text style={styles.handle}>you</Text> : <Handle userId={thread.sender_id} handle={thread.sender?.handle ?? '?'} style={styles.handle} />}
            {thread.source_type ? ` · ${formatSourceType(thread.source_type)}` : ''}
          </Text>
          {obscured ? (
            <Text style={styles.videoTitleObscured}>React to reveal this video</Text>
          ) : thread.video_title ? (
            <Text style={styles.videoTitle} numberOfLines={2}>{thread.video_title}</Text>
          ) : null}
          {canReact ? (
            <TouchableOpacity style={styles.reactBtn} activeOpacity={0.85}
              onPress={() => navigation.getParent()?.navigate('RecordReaction', {
                threadId, videoId: thread.video_id, sourceType: thread.source_type,
                introUrl: thread.intro_url ?? undefined,
                introDuration: thread.intro_duration ?? undefined,
              })}>
              <Text style={styles.reactBtnText}>Record Your Reaction</Text>
            </TouchableOpacity>
          ) : hasReacted ? (
            <View style={styles.reactedBadge}>
              <Text style={styles.reactedText}>You Reacted ✓</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* All reactions — group inbox */}
      <Text style={styles.sectionTitle}>
        {displayReactions.length === 0
          ? 'No reactions yet'
          : `${displayReactions.length} reaction${displayReactions.length !== 1 ? 's' : ''}`}
      </Text>

      {displayReactions.map((r) => {
        // Fall back to the reaction's own resolved state so optimistic (pending)
        // reactions — not covered by the dlStatus effect — show as watchable.
        const status = dlStatus[r.id] ?? (r.resolvedUri && !r.needsDownload ? 'local' : 'unavailable');
        const pct = dlPct[r.id] ?? 0;
        const handle = (r.user as any)?.handle ?? '?';
        const canWatch = status === 'local';
        // No cloud copy left → permanently gone. Has one but failed → retryable.
        const expired = !r.video_url;
        const retryable = status === 'unavailable' && !expired;

        return (
          <TouchableOpacity
            key={r.id}
            style={styles.reactionCard}
            activeOpacity={canWatch || retryable ? 0.8 : 1}
            onPress={canWatch
              ? () => navigation.navigate('WatchReaction', { reactionId: r.id })
              : retryable
              ? () => retryDownload(r)
              : undefined
            }>

            <View style={[styles.reactionThumb, status !== 'local' && styles.reactionThumbDim]}>
              {status === 'local' && <Text style={styles.reactionThumbIcon}>▶</Text>}
              {status === 'downloading' && (
                <View style={styles.dlProgress}>
                  <ActivityIndicator color={C.ACCENT} size="small" />
                  {pct > 0 && <Text style={styles.dlPct}>{pct}%</Text>}
                </View>
              )}
              {status === 'unavailable' && (expired
                ? <Image source={require('../../../assets/lock.png')} style={styles.reactionThumbLock} resizeMode="contain" />
                : <Text style={styles.reactionRetryIcon}>↻</Text>)}
            </View>

            <View style={styles.reactionInfo}>
              <TouchableOpacity
                onPress={() => openProfile({ userId: (r as any).user?.id ?? (r as any).poster_id, handle })}
                hitSlop={8} activeOpacity={0.7}>
                <Text style={styles.reactionHandle}>@{handle}</Text>
              </TouchableOpacity>
              {status === 'local' && (
                <Text style={styles.reactionDuration}>{r.duration}s reaction</Text>
              )}
              {status === 'downloading' && (
                <Text style={styles.reactionStatusText}>Downloading…</Text>
              )}
              {status === 'unavailable' && (
                <Text style={[styles.reactionStatusText, retryable && styles.reactionRetryText]}>
                  {expired ? 'No longer available' : 'Tap to re-download'}
                </Text>
              )}
            </View>

            <ReactionEmojiChips
              reactions={r.emoji_reactions}
              userId={user?.id}
              onToggle={(emoji) => handleEmojiToggle(r.id, emoji)}
            />
          </TouchableOpacity>
        );
      })}

      <View style={styles.bottomPad} />
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
  errorText: { color: C.MUTED, fontSize: FONT.SIZES.MD },
  thumbWrap: { backgroundColor: C.BLACK, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  thumbBlind: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.BLACK,
  },
  thumbBlindImg: { width: 160, height: 200, opacity: 0.85 },
  blindOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.95)',
    paddingHorizontal: SPACE.LG, gap: SPACE.SM, paddingTop: SPACE.LG, paddingBottom: SPACE.LG,
  },
  posterHandle: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED },
  handle: { color: C.ACCENT_HOT, fontFamily: FONT.BODY_MEDIUM },
  videoTitle: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.WHITE },
  videoTitleObscured: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic' },
  reactBtn: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    alignItems: 'center',
  },
  reactBtnText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD },
  reactedBadge: {
    padding: SPACE.MD,
    borderRadius: RADIUS.MD,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  reactedText: { color: 'rgba(255,255,255,0.8)', fontSize: FONT.SIZES.SM },
  sectionTitle: {
    fontSize: FONT.SIZES.SM,
    color: C.MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: SPACE.LG,
    marginBottom: SPACE.SM,
    paddingBottom: SPACE.SM,
  },
  reactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.MD,
    paddingHorizontal: SPACE.LG,
    paddingVertical: SPACE.MD,
    borderTopWidth: 1,
    borderTopColor: C.BORDER,
    overflow: 'hidden',
  },
  reactionThumb: {
    width: 56, height: 56,
    borderRadius: RADIUS.MD,
    backgroundColor: C.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionThumbDim: { opacity: 1 },
  reactionThumbIcon: { fontSize: 20 },
  reactionThumbLock: { width: 22, height: 32 },
  reactionRetryIcon: { fontSize: 24, color: C.ACCENT_HOT, fontWeight: '700' },
  dlProgress: { alignItems: 'center', gap: 2 },
  dlPct: { fontSize: 10, color: C.MUTED },
  reactionInfo: { flex: 1 },
  reactionHandle: { fontSize: FONT.SIZES.MD, fontWeight: '600', color: C.ACCENT_HOT },
  reactionDuration: { fontSize: FONT.SIZES.SM, color: C.MUTED },
  reactionStatusText: { fontSize: FONT.SIZES.SM, color: C.MUTED, fontStyle: 'italic' },
  reactionRetryText: { color: C.ACCENT_HOT, fontStyle: 'normal' },
  backBtn: {
    position: 'absolute', left: SPACE.MD,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: C.WHITE, fontSize: 26, lineHeight: 30, fontFamily: FONT.BODY },
  bottomPad: { height: SPACE.XXXL },
});
