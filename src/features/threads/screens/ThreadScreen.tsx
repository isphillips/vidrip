import React, { useCallback, useEffect, useRef, useState } from 'react';
import EmojiChips from '../../../components/EmojiChips';

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
  const { top } = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [reactions, setReactions] = useState<ReactionItem[]>([]);
  const [loading, setLoading] = useState(true);
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
      if (t?.my_status === 'pending') { markThreadSeen(threadId); }
    } finally {
      if (mountedRef.current) { setLoading(false); }
    }
  }, [threadId, user]);

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

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Auto-download all cloud reactions when thread loads — messages inbox model
  useEffect(() => {
    if (!reactions.length) { return; }

    const initialStatuses: Record<string, DlStatus> = {};
    reactions.forEach(r => {
      initialStatuses[r.id] = r.resolvedUri && !r.needsDownload ? 'local' : 'unavailable';
    });
    setDlStatus(initialStatuses);

    reactions.forEach(r => {
      if (!r.needsDownload || !r.resolvedUri) { return; }
      if (activeDownloadsRef.current.has(r.id)) { return; }

      activeDownloadsRef.current.add(r.id);
      setDlStatus(prev => ({ ...prev, [r.id]: 'downloading' }));

      downloadAndCache(r.id, r.resolvedUri, (pct) => {
        if (mountedRef.current) {
          setDlPct(prev => ({ ...prev, [r.id]: pct }));
        }
      })
        .then(() => {
          activeDownloadsRef.current.delete(r.id);
          if (!mountedRef.current) { return; }
          setDlStatus(prev => ({ ...prev, [r.id]: 'local' }));
          setDlPct(prev => ({ ...prev, [r.id]: 100 }));
          if (user?.id) { recordReactionDownload(r.id, user.id).catch(() => {}); }
        })
        .catch(() => {
          activeDownloadsRef.current.delete(r.id);
          if (mountedRef.current) {
            setDlStatus(prev => ({ ...prev, [r.id]: 'unavailable' }));
          }
        });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactions]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.ACCENT} /></View>;
  }

  if (!thread) {
    return <View style={styles.center}><Text style={styles.errorText}>Thread not found</Text></View>;
  }

  const isSender = thread.sender_id === user?.id;
  const hasReacted = thread.my_status === 'reacted';
  const canReact = !isSender && !hasReacted;
  const obscured = canReact;
  const thumbnail = thread.video_thumbnail ??
    (thread.source_type === 'youtube' ? `https://img.youtube.com/vi/${thread.video_id}/hqdefault.jpg` : null);

  return (
    <View style={styles.container}>
    <ScrollView bounces={false}>
      {/* Thumbnail / blind — full height with bottom overlay */}
      <View style={[styles.thumbWrap, { height: height - 113, width: '100%' }]}>
        {obscured ? (
          <View style={styles.thumbBlind}>
            <Image source={require('../../../assets/questionmark.png')} style={styles.thumbBlindImg} resizeMode="contain" />
          </View>
        ) : (
          <Image source={{ uri: thumbnail }} style={styles.thumb} resizeMode="cover" />
        )}

        {/* Overlay — same position for both states */}
        <View style={styles.blindOverlay}>
          <Text style={styles.posterHandle}>
            Shared by <Text style={styles.handle}>{isSender ? 'you' : `@${thread.sender?.handle ?? '?'}`}</Text>
          </Text>
          {obscured ? (
            <Text style={styles.videoTitleObscured}>React to reveal this video</Text>
          ) : thread.video_title ? (
            <Text style={styles.videoTitle} numberOfLines={2}>{thread.video_title}</Text>
          ) : null}
          {canReact ? (
            <TouchableOpacity style={styles.reactBtn} activeOpacity={0.85}
              onPress={() => navigation.getParent()?.navigate('RecordReaction', { threadId, videoId: thread.video_id, sourceType: thread.source_type })}>
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
        {reactions.length === 0
          ? 'No reactions yet'
          : `${reactions.length} reaction${reactions.length !== 1 ? 's' : ''}`}
      </Text>

      {reactions.map((r) => {
        const status = dlStatus[r.id] ?? 'unavailable';
        const pct = dlPct[r.id] ?? 0;
        const handle = (r.user as any)?.handle ?? '?';
        const canWatch = status === 'local';

        return (
          <TouchableOpacity
            key={r.id}
            style={styles.reactionCard}
            activeOpacity={canWatch ? 0.8 : 1}
            onPress={canWatch
              ? () => navigation.navigate('WatchReaction', { reactionId: r.id })
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
              {status === 'unavailable' && <Text style={styles.reactionThumbIcon}>🔒</Text>}
            </View>

            <View style={styles.reactionInfo}>
              <Text style={styles.reactionHandle}>@{handle}</Text>
              {status === 'local' && (
                <Text style={styles.reactionDuration}>{r.duration}s reaction</Text>
              )}
              {status === 'downloading' && (
                <Text style={styles.reactionStatusText}>Downloading…</Text>
              )}
              {status === 'unavailable' && (
                <Text style={styles.reactionStatusText}>
                  {r.storage_mode === 'local' ? 'Not shared yet' : 'Unavailable'}
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
    backgroundColor: C.BG,
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
  reactionThumbDim: { opacity: 0.5 },
  reactionThumbIcon: { fontSize: 20 },
  dlProgress: { alignItems: 'center', gap: 2 },
  dlPct: { fontSize: 10, color: C.MUTED },
  reactionInfo: { flex: 1 },
  reactionHandle: { fontSize: FONT.SIZES.MD, fontWeight: '600', color: C.INK },
  reactionDuration: { fontSize: FONT.SIZES.SM, color: C.MUTED },
  reactionStatusText: { fontSize: FONT.SIZES.SM, color: C.MUTED, fontStyle: 'italic' },
  backBtn: {
    position: 'absolute', left: SPACE.MD,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: C.WHITE, fontSize: 26, lineHeight: 30, fontFamily: FONT.BODY },
  bottomPad: { height: SPACE.XXXL },
});
