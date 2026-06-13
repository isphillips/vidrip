import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Modal, Animated, Dimensions, Alert,
} from 'react-native';
import Video from 'react-native-video';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../../infrastructure/supabase/client';
import {
  fetchVideoComments, deleteVideoComment,
  addCommentEmoji, removeCommentEmoji,
  type VideoComment, type CommentCursor,
} from '../../../infrastructure/supabase/queries/videoComments';
import { localPathForComment } from '../../../infrastructure/storage/commentStorage';
import { useAuthStore } from '../../../store/authStore';
import { usePendingCommentsStore } from '../../../store/pendingCommentsStore';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import type { RootStackParamList } from '../../../app/navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

const EMOJI_OPTIONS = ['❤️', '😂', '🔥', '😮', '👏', '💯'];
const SHEET_HEIGHT = Dimensions.get('window').height * 0.72;

interface Props {
  visible: boolean;
  rootSourceId: string;
  sourceType: 'youtube' | 'tiktok' | 'instagram';
  videoTitle?: string;
  refreshKey: number;
  onClose: () => void;
}

// ── Comment video player modal ───────────────────────────────────────────────

function CommentVideoModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={vStyles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={vStyles.player}>
          <Video
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            controls
            autoplay
          />
          <TouchableOpacity style={vStyles.close} onPress={onClose}>
            <Text style={vStyles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const vStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center' },
  player:   { width: '100%', height: '80%', backgroundColor: '#000' },
  close:    { position: 'absolute', top: SPACE.MD, right: SPACE.MD, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: RADIUS.FULL, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: C.WHITE, fontSize: 16, fontFamily: FONT.BODY_BOLD },
});

// ── Emoji picker ─────────────────────────────────────────────────────────────

function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  return (
    <View style={ep.row}>
      {EMOJI_OPTIONS.map(e => (
        <TouchableOpacity key={e} style={ep.btn} onPress={() => onPick(e)}>
          <Text style={ep.emoji}>{e}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const ep = StyleSheet.create({
  row:  { flexDirection: 'row', paddingHorizontal: SPACE.LG, paddingVertical: SPACE.SM, gap: SPACE.SM, backgroundColor: C.SURFACE, borderTopWidth: 1, borderColor: C.BORDER },
  btn:  { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.SM, backgroundColor: C.SURFACE_2 },
  emoji: { fontSize: 22 },
});

// ── Comment card ──────────────────────────────────────────────────────────────

function CommentCard({
  comment, currentUserId, onReply, onDelete, onEmojiTap, onEmojiLongPress,
}: {
  comment: VideoComment;
  currentUserId: string;
  onReply: (c: VideoComment) => void;
  onDelete: (c: VideoComment) => void;
  onEmojiTap: (c: VideoComment, emoji: string) => void;
  onEmojiLongPress: (c: VideoComment) => void;
}) {
  const [playUri, setPlayUri] = useState<string | null>(null);

  const initial = (comment.author_handle ?? '?').charAt(0).toUpperCase();
  const ts = formatAge(comment.created_at);
  const dur = comment.duration ? formatDur(comment.duration) : null;

  // Resolve playback URI: prefer cloud URL, fall back to local cache
  const playableUri = comment.video_url ?? (comment.local_path ?? null);

  const handleVideoTap = () => {
    if (!playableUri) { return; }
    setPlayUri(playableUri);
  };

  // Aggregate emoji reactions (emoji → count, whether current user reacted)
  const emojiMap = new Map<string, { count: number; mine: boolean }>();
  (comment as any).emoji_reactions?.forEach((r: { emoji: string; user_id: string }) => {
    const prev = emojiMap.get(r.emoji) ?? { count: 0, mine: false };
    emojiMap.set(r.emoji, { count: prev.count + 1, mine: prev.mine || r.user_id === currentUserId });
  });
  const emojiEntries = [...emojiMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 4);

  return (
    <View style={cc.card}>
      {/* Author row */}
      <View style={cc.authorRow}>
        <View style={cc.avatar}>
          <Text style={cc.avatarText}>{initial}</Text>
        </View>
        <View style={cc.authorInfo}>
          <Text style={cc.handle}>@{comment.author_handle}</Text>
          <Text style={cc.time}>{comment.is_friend ? '👤 ' : ''}{ts}</Text>
        </View>
        {comment.author_id === currentUserId && (
          <TouchableOpacity onPress={() => onDelete(comment)} style={cc.deleteBtn} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color={C.MUTED} />
          </TouchableOpacity>
        )}
      </View>

      {/* Video tile */}
      <TouchableOpacity style={cc.videoTile} onPress={handleVideoTap} activeOpacity={0.85}>
        <View style={cc.videoTileInner}>
          <Ionicons name={playableUri ? 'play-circle' : 'hourglass-outline'} size={36} color={C.WHITE} />
          {dur && <Text style={cc.durText}>{dur}</Text>}
        </View>
      </TouchableOpacity>

      {/* Reactions + reply row */}
      <View style={cc.actionsRow}>
        <View style={cc.emojisRow}>
          {emojiEntries.map(([emoji, { count, mine }]) => (
            <TouchableOpacity
              key={emoji}
              style={[cc.emojiChip, mine && cc.emojiChipMine]}
              onPress={() => onEmojiTap(comment, emoji)}>
              <Text style={cc.emojiChipText}>{emoji} {count}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={cc.emojiAdd} onLongPress={() => onEmojiLongPress(comment)} onPress={() => onEmojiLongPress(comment)} hitSlop={4}>
            <Ionicons name="happy-outline" size={18} color={C.MUTED} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={cc.replyBtn} onPress={() => onReply(comment)}>
          <Ionicons name="chatbubble-outline" size={14} color={C.MUTED} />
          <Text style={cc.replyCount}>{comment.reply_count > 0 ? comment.reply_count : 'Reply'}</Text>
        </TouchableOpacity>
      </View>

      {playUri && <CommentVideoModal uri={playUri} onClose={() => setPlayUri(null)} />}
    </View>
  );
}

function formatAge(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) { return 'just now'; }
  if (diff < 3600) { return `${Math.floor(diff / 60)}m`; }
  if (diff < 86400) { return `${Math.floor(diff / 3600)}h`; }
  return `${Math.floor(diff / 86400)}d`;
}

function formatDur(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const cc = StyleSheet.create({
  card:       { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, marginHorizontal: SPACE.LG, marginBottom: SPACE.MD, overflow: 'hidden' },
  authorRow:  { flexDirection: 'row', alignItems: 'center', padding: SPACE.MD, gap: SPACE.SM },
  avatar:     { width: 34, height: 34, borderRadius: RADIUS.FULL, backgroundColor: C.ACCENT, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_BOLD },
  authorInfo: { flex: 1 },
  handle:     { color: C.INK, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD },
  time:       { color: C.MUTED, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, marginTop: 1 },
  deleteBtn:  { padding: SPACE.XS },
  videoTile:  { marginHorizontal: SPACE.MD, borderRadius: RADIUS.SM, overflow: 'hidden', backgroundColor: '#000', height: 90 },
  videoTileInner: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: SPACE.XS },
  durText:    { color: C.WHITE, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM },
  actionsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM, gap: SPACE.SM },
  emojisRow:  { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.XS, alignItems: 'center' },
  emojiChip:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.SURFACE_2, borderRadius: RADIUS.FULL, paddingHorizontal: SPACE.SM, paddingVertical: 3, borderWidth: 1, borderColor: C.BORDER },
  emojiChipMine: { borderColor: C.ACCENT },
  emojiChipText: { color: C.INK, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  emojiAdd:   { padding: SPACE.XS },
  replyBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACE.SM, paddingVertical: SPACE.XS, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE_2, borderWidth: 1, borderColor: C.BORDER },
  replyCount: { color: C.MUTED, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM },
});

// ── Main sheet ────────────────────────────────────────────────────────────────

export default function VideoCommentsSheet({
  visible, rootSourceId, sourceType, videoTitle, refreshKey, onClose,
}: Props) {
  const { bottom } = useSafeAreaInsets();
  const navigation = useNavigation<RootNav>();
  const { user } = useAuthStore();

  // Optimistic, just-recorded comments awaiting their cloud upload.
  const pending = usePendingCommentsStore(s => s.pending);
  const reconcilePending = usePendingCommentsStore(s => s.reconcile);

  const [comments, setComments] = useState<VideoComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<CommentCursor | null>(null);
  const hasMoreRef = useRef(true);

  // Replies sub-level
  const [replyParent, setReplyParent] = useState<VideoComment | null>(null);
  const [replies, setReplies] = useState<VideoComment[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);

  // Emoji picker
  const [emojiTarget, setEmojiTarget] = useState<VideoComment | null>(null);

  // Sheet slide-in animation
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 70, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: SHEET_HEIGHT, duration: 240, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  // Fetch comments whenever sheet opens or refreshKey changes
  const load = useCallback(async (reset = true) => {
    if (reset) { setLoading(true); hasMoreRef.current = true; }
    else { setLoadingMore(true); }
    try {
      const page = await fetchVideoComments({
        rootSourceId, sourceType,
        parentCommentId: null,
        viewerId: user?.id,
        cursor: reset ? null : cursor,
        limit: 20,
      });
      if (reset) {
        setComments(page);
      } else {
        setComments(prev => [...prev, ...page]);
      }
      // Drop optimistic copies that have now landed server-side (video_url set).
      reconcilePending(page.map(p => p.id));
      hasMoreRef.current = page.length === 20;
      if (page.length > 0) {
        const last = page[page.length - 1];
        setCursor({ emoji_count: last.emoji_count, created_at: last.created_at, id: last.id });
      }
    } catch (e) {
      console.error('[VideoCommentsSheet] load', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [rootSourceId, sourceType, user?.id, cursor, reconcilePending]);

  useEffect(() => {
    if (!visible) { return; }
    load(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, refreshKey, rootSourceId, sourceType]);

  // Realtime: new emoji reactions
  useEffect(() => {
    if (!visible) { return; }
    const channel = supabase.channel(`comment-emojis-${rootSourceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_comment_emoji_reactions' },
        (payload) => {
          const commentId = (payload.new as any)?.comment_id ?? (payload.old as any)?.comment_id;
          if (!commentId) { return; }
          // Re-fetch that specific comment's emoji reactions would be ideal, but for
          // Phase 2 just reload the page so counts stay accurate.
          load(true);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rootSourceId]);

  const loadReplies = useCallback(async (parent: VideoComment) => {
    setReplyParent(parent);
    setRepliesLoading(true);
    try {
      const page = await fetchVideoComments({
        rootSourceId, sourceType,
        parentCommentId: parent.id,
        viewerId: user?.id,
        limit: 30,
      });
      setReplies(page);
      reconcilePending(page.map(p => p.id));
    } catch (e) {
      console.error('[VideoCommentsSheet] loadReplies', e);
    } finally {
      setRepliesLoading(false);
    }
  }, [rootSourceId, sourceType, user?.id, reconcilePending]);

  const handleDelete = (comment: VideoComment) => {
    Alert.alert('Delete comment?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteVideoComment(comment.id);
            setComments(prev => prev.filter(c => c.id !== comment.id));
            setReplies(prev => prev.filter(c => c.id !== comment.id));
          } catch { Alert.alert('Error', 'Could not delete comment.'); }
        },
      },
    ]);
  };

  const handleEmojiTap = async (comment: VideoComment, emoji: string) => {
    if (!user) { return; }
    // Optimistic toggle
    const hasIt = (comment as any).emoji_reactions?.some(
      (r: any) => r.emoji === emoji && r.user_id === user.id,
    );
    if (hasIt) {
      setComments(prev => prev.map(c => c.id !== comment.id ? c : {
        ...c,
        emoji_count: c.emoji_count - 1,
        emoji_reactions: (c as any).emoji_reactions?.filter(
          (r: any) => !(r.emoji === emoji && r.user_id === user.id),
        ),
      } as VideoComment));
      await removeCommentEmoji(comment.id, user.id, emoji).catch(() => {});
    } else {
      setComments(prev => prev.map(c => c.id !== comment.id ? c : {
        ...c,
        emoji_count: c.emoji_count + 1,
        emoji_reactions: [...((c as any).emoji_reactions ?? []), { emoji, user_id: user.id }],
      } as VideoComment));
      await addCommentEmoji(comment.id, user.id, emoji).catch(() => {});
    }
  };

  const handleRecordComment = (parentCommentId?: string) => {
    navigation.navigate('RecordComment', {
      rootSourceId,
      sourceType,
      parentCommentId,
      videoTitle,
    });
  };

  if (!visible) { return null; }

  // Fold in optimistic comments for this level (own just-posted, upload in-flight).
  const mergePending = (real: VideoComment[], level: string | null) => {
    const extra = pending.filter(p =>
      p.root_source_id === rootSourceId &&
      p.source_type === sourceType &&
      (p.parent_comment_id ?? null) === level &&
      !real.some(r => r.id === p.id),
    );
    return extra.length ? [...extra, ...real] : real;
  };

  const showReplies = replyParent !== null;
  const mergedComments = mergePending(comments, null);
  const mergedReplies = showReplies ? mergePending(replies, replyParent!.id) : replies;
  const listData = showReplies ? mergedReplies : mergedComments;
  const listLoading = showReplies ? repliesLoading : loading;
  const headerTitle = showReplies
    ? `Replies to @${replyParent!.author_handle}`
    : `Comments${mergedComments.length > 0 ? ` (${mergedComments.length})` : ''}`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />

      {/* Sheet */}
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={s.handle} />

        {/* Header */}
        <View style={s.header}>
          {showReplies ? (
            <TouchableOpacity onPress={() => setReplyParent(null)} hitSlop={8} style={s.backBtn}>
              <Ionicons name="chevron-back" size={22} color={C.INK} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 30 }} />
          )}
          <Text style={s.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={C.INK} />
          </TouchableOpacity>
        </View>

        {/* List */}
        {listLoading ? (
          <View style={s.center}><ActivityIndicator color={C.ACCENT} /></View>
        ) : listData.length === 0 ? (
          <View style={s.center}>
            <Text style={s.empty}>
              {showReplies ? 'No replies yet' : 'No comments yet. Be the first!'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={listData}
            keyExtractor={c => c.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: SPACE.MD, paddingBottom: SPACE.MD }}
            onEndReached={() => {
              if (!showReplies && hasMoreRef.current && !loadingMore) { load(false); }
            }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={C.ACCENT} style={{ paddingVertical: SPACE.LG }} /> : null}
            renderItem={({ item }) => (
              <CommentCard
                comment={item}
                currentUserId={user?.id ?? ''}
                onReply={c => {
                  if (showReplies) {
                    handleRecordComment(replyParent!.id);
                  } else {
                    if (c.reply_count > 0) {
                      loadReplies(c);
                    } else {
                      handleRecordComment(c.id);
                    }
                  }
                }}
                onDelete={handleDelete}
                onEmojiTap={handleEmojiTap}
                onEmojiLongPress={c => setEmojiTarget(c)}
              />
            )}
          />
        )}

        {/* Emoji picker (floats above footer) */}
        {emojiTarget && (
          <EmojiPicker onPick={emoji => {
            handleEmojiTap(emojiTarget, emoji);
            setEmojiTarget(null);
          }} />
        )}

        {/* Footer */}
        <View style={[s.footer, { paddingBottom: bottom + SPACE.SM }]}>
          <TouchableOpacity
            style={s.commentBtn}
            onPress={() => handleRecordComment(showReplies ? replyParent!.id : undefined)}
            activeOpacity={0.85}>
            <Ionicons name="videocam" size={18} color={C.WHITE} />
            <Text style={s.commentBtnText}>
              {showReplies ? 'Record Reply' : 'Record Comment'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 30 },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: C.BG_SOLID,
    borderTopLeftRadius: RADIUS.XL,
    borderTopRightRadius: RADIUS.XL,
    zIndex: 31,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.25, shadowRadius: 16,
    elevation: 32,
  },
  handle: { width: 40, height: 4, backgroundColor: C.BORDER_STRONG, borderRadius: RADIUS.FULL, alignSelf: 'center', marginTop: SPACE.MD, marginBottom: SPACE.SM },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.LG, paddingBottom: SPACE.MD, borderBottomWidth: 1, borderColor: C.BORDER },
  backBtn: { padding: SPACE.XS },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK, paddingHorizontal: SPACE.SM },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:   { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, textAlign: 'center', paddingHorizontal: SPACE.XL },
  footer:  { paddingHorizontal: SPACE.LG, paddingTop: SPACE.SM, borderTopWidth: 1, borderColor: C.BORDER },
  commentBtn: { backgroundColor: C.ACCENT, borderRadius: RADIUS.MD, paddingVertical: SPACE.MD, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.SM },
  commentBtnText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD },
});
