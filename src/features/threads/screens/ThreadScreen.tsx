import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchThread,
  fetchReactions,
  markThreadSeen,
  type ThreadDetail,
  type ReactionItem,
} from '../../../infrastructure/supabase/queries/threads';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

export default function ThreadScreen({ route, navigation }: FeedStackScreenProps<'Thread'>) {
  const { threadId } = route.params;
  const { user } = useAuthStore();
  const { width } = useWindowDimensions();

  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [reactions, setReactions] = useState<ReactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<YoutubeIframeRef>(null);

  // Compact height so reactions are visible without scrolling
  const playerHeight = Math.round(width * 0.6);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [t, r] = await Promise.all([
        fetchThread(threadId, user.id),
        fetchReactions(threadId),
      ]);
      setThread(t);
      setReactions(r);
      // Mark as seen if it was pending
      if (t?.my_status === 'pending') markThreadSeen(threadId);
    } finally {
      setLoading(false);
    }
  }, [threadId, user]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT} />
      </View>
    );
  }

  if (!thread) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>thread not found</Text>
      </View>
    );
  }

  const isSender = thread.sender_id === user?.id;
  const hasReacted = thread.my_status === 'reacted';
  const canReact = !isSender && !hasReacted;

  return (
    <ScrollView style={styles.container} bounces={false}>
      {/* YouTube Shorts player */}
      <View style={[styles.playerContainer, { height: playerHeight }]}>
        <YoutubePlayer
          ref={playerRef}
          height={playerHeight}
          width={width}
          videoId={thread.video_id}
          play={playing}
          onChangeState={(state) => {
            if (state === 'ended') setPlaying(false);
          }}
          initialPlayerParams={{
            rel: 0,
            modestbranding: 1,
            controls: 1,
          }}
          webViewStyle={styles.player}
        />
      </View>

      {/* Thread meta */}
      <View style={styles.meta}>
        <Text style={styles.metaText}>
          Shared by{' '}
          <Text style={styles.metaHandle}>
            {isSender ? 'you' : `@${thread.sender?.handle ?? '?'}`}
          </Text>
        </Text>
        {thread.video_title && (
          <Text style={styles.videoTitle} numberOfLines={2}>{thread.video_title}</Text>
        )}
      </View>

      {/* React button */}
      {canReact && (
        <TouchableOpacity
          style={styles.reactButton}
          activeOpacity={0.85}
          onPress={() =>
            navigation.getParent()?.navigate('RecordReaction', {
              threadId,
              videoId: thread.video_id,
            })
          }>
          <Text style={styles.reactButtonText}>Record Your Reaction 🎬</Text>
        </TouchableOpacity>
      )}

      {hasReacted && (
        <View style={styles.reactedBadge}>
          <Text style={styles.reactedText}>You Reacted ✓</Text>
        </View>
      )}

      {/* Reactions */}
      <Text style={styles.sectionTitle}>
        {reactions.length === 0 ? 'No reactions yet' : `${reactions.length} reaction${reactions.length !== 1 ? 's' : ''}`}
      </Text>

      {reactions.map((r) => (
        <TouchableOpacity
          key={r.id}
          style={styles.reactionCard}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('WatchReaction', {
            reactionId: r.id,
            videoId: thread.video_id,
            videoTitle: thread.video_title ?? undefined,
          })}>
          <View style={styles.reactionThumb}>
            <Text style={styles.reactionThumbIcon}>▶</Text>
          </View>
          <View style={styles.reactionInfo}>
            <Text style={styles.reactionHandle}>@{(r.user as any)?.handle ?? '?'}</Text>
            <Text style={styles.reactionDuration}>{r.duration}s reaction</Text>
          </View>
          {r.emoji_reactions?.length > 0 && (
            <Text style={styles.reactionEmojis}>
              {r.emoji_reactions.slice(0, 3).map(e => e.emoji).join('')}
            </Text>
          )}
        </TouchableOpacity>
      ))}

      <View style={styles.bottomPad} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  center: { flex: 1, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: C.MUTED, fontSize: FONT.SIZES.MD },
  playerContainer: { backgroundColor: C.BLACK, overflow: 'hidden' },
  player: { backgroundColor: C.BLACK },
  meta: { padding: SPACE.LG, gap: SPACE.XS },
  metaText: { fontSize: FONT.SIZES.SM, color: C.MUTED },
  metaHandle: { color: C.ACCENT_HOT, fontWeight: '600' },
  videoTitle: { fontSize: FONT.SIZES.LG, fontWeight: '600', color: C.INK },
  reactButton: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    marginHorizontal: SPACE.LG,
    marginBottom: SPACE.LG,
    padding: SPACE.LG,
    alignItems: 'center',
  },
  reactButtonText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontWeight: '700' },
  reactedBadge: {
    marginHorizontal: SPACE.LG,
    marginBottom: SPACE.LG,
    padding: SPACE.MD,
    borderRadius: RADIUS.MD,
    backgroundColor: C.SURFACE,
    alignItems: 'center',
  },
  reactedText: { color: C.MUTED, fontSize: FONT.SIZES.SM },
  sectionTitle: {
    fontSize: FONT.SIZES.SM,
    color: C.MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: SPACE.LG,
    marginBottom: SPACE.SM,
  },
  reactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.MD,
    paddingHorizontal: SPACE.LG,
    paddingVertical: SPACE.MD,
    borderTopWidth: 1,
    borderTopColor: C.BORDER,
  },
  reactionThumb: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.MD,
    backgroundColor: C.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionThumbIcon: { fontSize: 20 },
  reactionInfo: { flex: 1 },
  reactionHandle: { fontSize: FONT.SIZES.MD, fontWeight: '600', color: C.INK },
  reactionDuration: { fontSize: FONT.SIZES.SM, color: C.MUTED },
  reactionEmojis: { fontSize: FONT.SIZES.LG },
  bottomPad: { height: SPACE.XXXL },
});
