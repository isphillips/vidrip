import { log } from '../../../infrastructure/logging/logger';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import EmojiGlyph, { QUICK_EMOJIS } from '../../../components/EmojiGlyph';
import { useAuthStore } from '../../../store/authStore';
import { usePendingCommentsStore } from '../../../store/pendingCommentsStore';
import { useUploadStore } from '../../../store/uploadStore';
import { useBlockStore } from '../../../store/blockStore';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import type { RootStackParamList } from '../../../app/navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import CommentRow from './CommentRow';
import { flattenThread, rootCount, findComment, ROOT_KEY } from '../commentTree';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

const EMOJI_OPTIONS = QUICK_EMOJIS;
const SHEET_HEIGHT = Dimensions.get('window').height * 0.72;
const ROOT_PAGE = 20;
const REPLY_PAGE = 50;

interface Props {
  visible: boolean;
  rootSourceId: string;
  sourceType: 'youtube' | 'tiktok' | 'instagram' | 'facebook';
  videoTitle?: string;
  refreshKey: number;
  onClose: () => void;
}

// ── Comment video player modal (one per sheet; lifted out of the rows so FlatList
//    recycling can't unmount a playing clip, and so back returns to the same scroll). ──
function CommentVideoModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={vStyles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={vStyles.player}>
          <Video source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" controls />
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
          <EmojiGlyph emoji={e} size={26} />
        </TouchableOpacity>
      ))}
    </View>
  );
}
const ep = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: SPACE.LG, paddingVertical: SPACE.SM, gap: SPACE.SM, backgroundColor: C.SURFACE, borderTopWidth: 1, borderColor: C.BORDER },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.SM, backgroundColor: C.SURFACE_2 },
});

// ── Main sheet ────────────────────────────────────────────────────────────────
export default function VideoCommentsSheet({
  visible, rootSourceId, sourceType, videoTitle, refreshKey, onClose,
}: Props) {
  const { bottom } = useSafeAreaInsets();
  const navigation = useNavigation<RootNav>();
  const { user } = useAuthStore();

  const pending = usePendingCommentsStore(s => s.pending);
  const reconcilePending = usePendingCommentsStore(s => s.reconcile);
  const removePending = usePendingCommentsStore(s => s.remove);

  // Lazily-loaded comment tree: children keyed by parent id (roots under ROOT_KEY).
  const [childrenById, setChildrenById] = useState<Record<string, VideoComment[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusRootId, setFocusRootId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [playUri, setPlayUri] = useState<string | null>(null);
  const [emojiTarget, setEmojiTarget] = useState<VideoComment | null>(null);

  const cursorRef = useRef<CommentCursor | null>(null);
  const hasMoreRef = useRef(true);
  const childrenByIdRef = useRef(childrenById);
  useEffect(() => { childrenByIdRef.current = childrenById; }, [childrenById]);

  // Sheet slide-in animation
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 70, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: SHEET_HEIGHT, duration: 240, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  // ── Loaders ──
  const loadRoots = useCallback(async (reset: boolean) => {
    if (reset) { setLoading(true); hasMoreRef.current = true; }
    else { setLoadingMore(true); }
    try {
      const raw = await fetchVideoComments({
        rootSourceId, sourceType, parentCommentId: null, viewerId: user?.id,
        cursor: reset ? null : cursorRef.current, limit: ROOT_PAGE,
      });
      // App-wide block: hide comments from blocked users (and those who blocked me).
      const blocked = useBlockStore.getState().blocked;
      const page = raw.filter(c => !blocked.has(c.author_id));
      setChildrenById(prev => ({ ...prev, [ROOT_KEY]: reset ? page : [...(prev[ROOT_KEY] ?? []), ...page] }));
      reconcilePending(page.map(p => p.id));
      hasMoreRef.current = page.length === ROOT_PAGE;
      if (page.length) {
        const last = page[page.length - 1];
        cursorRef.current = { emoji_count: last.emoji_count, created_at: last.created_at, id: last.id };
      } else if (reset) { cursorRef.current = null; }
    } catch (e) {
      log.error('[VideoCommentsSheet] loadRoots', e);
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [rootSourceId, sourceType, user?.id, reconcilePending]);

  const loadChildren = useCallback(async (parentId: string) => {
    try {
      const raw = await fetchVideoComments({
        rootSourceId, sourceType, parentCommentId: parentId, viewerId: user?.id, limit: REPLY_PAGE,
      });
      const blocked = useBlockStore.getState().blocked;
      const page = raw.filter(c => !blocked.has(c.author_id));
      setChildrenById(prev => ({ ...prev, [parentId]: page }));
      reconcilePending(page.map(p => p.id));
    } catch (e) {
      log.error('[VideoCommentsSheet] loadChildren', e);
    }
  }, [rootSourceId, sourceType, user?.id, reconcilePending]);

  // Refresh roots + every currently-loaded reply thread (keeps counts fresh and swaps
  // optimistic copies for their landed server rows after an upload completes).
  const reloadAll = useCallback(async () => {
    try {
      // Apply the same app-wide block filter as loadRoots/loadChildren — otherwise a
      // reloadAll (upload-finished / emoji-realtime) would re-surface blocked users.
      const blocked = useBlockStore.getState().blocked;
      const ids: string[] = [];
      const roots = (await fetchVideoComments({
        rootSourceId, sourceType, parentCommentId: null, viewerId: user?.id, limit: ROOT_PAGE,
      })).filter(c => !blocked.has(c.author_id));
      ids.push(...roots.map(r => r.id));
      hasMoreRef.current = roots.length === ROOT_PAGE;
      cursorRef.current = roots.length
        ? { emoji_count: roots[roots.length - 1].emoji_count, created_at: roots[roots.length - 1].created_at, id: roots[roots.length - 1].id }
        : null;

      const parentIds = Object.keys(childrenByIdRef.current).filter(k => k !== ROOT_KEY);
      const childResults = await Promise.all(parentIds.map(pid =>
        fetchVideoComments({ rootSourceId, sourceType, parentCommentId: pid, viewerId: user?.id, limit: REPLY_PAGE })
          .then(rows => ({ pid, rows: rows.filter(c => !blocked.has(c.author_id)) }))
          .catch(() => ({ pid, rows: [] as VideoComment[] })),
      ));
      setChildrenById(() => {
        const next: Record<string, VideoComment[]> = { [ROOT_KEY]: roots };
        childResults.forEach(({ pid, rows }) => { next[pid] = rows; ids.push(...rows.map(r => r.id)); });
        return next;
      });
      reconcilePending(ids);
    } catch (e) {
      log.error('[VideoCommentsSheet] reloadAll', e);
    }
  }, [rootSourceId, sourceType, user?.id, reconcilePending]);

  // (Re)load whenever the sheet opens or the target video changes.
  useEffect(() => {
    if (!visible) { return; }
    setChildrenById({});
    setExpanded(new Set());
    setFocusRootId(null);
    cursorRef.current = null;
    loadRoots(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, refreshKey, rootSourceId, sourceType]);

  // When a background upload finishes, a just-posted comment's row gets its video_url —
  // refresh so it appears (get_video_comments only returns rows whose video_url is set).
  const uploadJobs = useUploadStore(s => s.jobs);
  const prevUploadingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!visible) { return; }
    const nowUploading = new Set(uploadJobs.filter(j => j.status === 'uploading').map(j => j.id));
    let finished = false;
    prevUploadingRef.current.forEach(id => { if (!nowUploading.has(id)) { finished = true; } });
    prevUploadingRef.current = nowUploading;
    if (finished) { reloadAll(); }
  }, [uploadJobs, visible, reloadAll]);

  // Realtime: refresh on any new/removed emoji reaction so counts stay accurate.
  useEffect(() => {
    if (!visible) { return; }
    const channel = supabase.channel(`comment-emojis-${rootSourceId}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_comment_emoji_reactions' },
        () => { reloadAll(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rootSourceId]);

  // ── Interactions ──
  const toggleExpand = useCallback((comment: VideoComment) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(comment.id)) {
        next.delete(comment.id);
      } else {
        next.add(comment.id);
        if (!childrenByIdRef.current[comment.id]) { loadChildren(comment.id); }
      }
      return next;
    });
  }, [loadChildren]);

  const handleContinue = useCallback((commentId: string) => {
    if (!childrenByIdRef.current[commentId]) { loadChildren(commentId); }
    setExpanded(prev => new Set(prev).add(commentId));
    setFocusRootId(commentId);
  }, [loadChildren]);

  const updateInTree = useCallback((id: string, updater: (c: VideoComment) => VideoComment) => {
    setChildrenById(prev => {
      let changed = false;
      const next: Record<string, VideoComment[]> = {};
      for (const key of Object.keys(prev)) {
        const arr = prev[key];
        const idx = arr.findIndex(c => c.id === id);
        if (idx === -1) { next[key] = arr; continue; }
        const copy = arr.slice();
        copy[idx] = updater(copy[idx]);
        next[key] = copy;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  const handleEmojiTap = useCallback(async (comment: VideoComment, emoji: string) => {
    if (!user) { return; }
    const reactions = (comment as any).emoji_reactions as { emoji: string; user_id: string }[] | undefined;
    const hasIt = reactions?.some(r => r.emoji === emoji && r.user_id === user.id);
    updateInTree(comment.id, c => (hasIt
      ? { ...c, emoji_count: Math.max(0, c.emoji_count - 1), emoji_reactions: ((c as any).emoji_reactions ?? []).filter((r: any) => !(r.emoji === emoji && r.user_id === user.id)) } as any
      : { ...c, emoji_count: c.emoji_count + 1, emoji_reactions: [...(((c as any).emoji_reactions) ?? []), { emoji, user_id: user.id }] } as any));
    if (hasIt) { await removeCommentEmoji(comment.id, user.id, emoji).catch(() => {}); }
    else { await addCommentEmoji(comment.id, user.id, emoji).catch(() => {}); }
  }, [user, updateInTree]);

  const handleDelete = useCallback((comment: VideoComment) => {
    Alert.alert('Delete comment?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteVideoComment(comment.id);
            setChildrenById(prev => {
              const next: Record<string, VideoComment[]> = {};
              for (const k of Object.keys(prev)) { next[k] = prev[k].filter(c => c.id !== comment.id); }
              return next;
            });
            removePending(comment.id);
          } catch { Alert.alert('Error', 'Could not delete comment.'); }
        },
      },
    ]);
  }, [removePending]);

  const handleRecordComment = useCallback((parentCommentId?: string) => {
    navigation.navigate('RecordComment', { rootSourceId, sourceType, parentCommentId, videoTitle });
  }, [navigation, rootSourceId, sourceType, videoTitle]);

  const rows = useMemo(() => flattenThread({
    childrenById, expanded, pending, rootSourceId, sourceType, focusRootId,
  }), [childrenById, expanded, pending, rootSourceId, sourceType, focusRootId]);

  if (!visible) { return null; }

  const focused = focusRootId ? findComment(focusRootId, childrenById, pending) : null;
  const totalRoots = rootCount(childrenById, pending, rootSourceId, sourceType);
  const headerTitle = focused
    ? `Thread · @${focused.author_handle}`
    : `Comments${totalRoots > 0 ? ` (${totalRoots})` : ''}`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={s.handle} />

        <View style={s.header}>
          {focusRootId && (
            <TouchableOpacity onPress={() => setFocusRootId(null)} hitSlop={8} style={s.backBtn}>
              <Ionicons name="chevron-back" size={22} color={C.INK} />
            </TouchableOpacity>
          )}
          <Text style={s.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={C.INK} />
          </TouchableOpacity>
        </View>

        {loading && rows.length === 0 ? (
          <View style={s.center}><ActivityIndicator color={C.ACCENT} /></View>
        ) : rows.length === 0 ? (
          <View style={s.center}>
            <Text style={s.empty}>No comments yet. Be the first!</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={r => (r.isContinue ? `continue-${r.comment.id}` : r.comment.id)}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingVertical: SPACE.SM }}
            onEndReached={() => {
              if (!focusRootId && hasMoreRef.current && !loadingMore) { loadRoots(false); }
            }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={C.ACCENT} style={{ paddingVertical: SPACE.LG }} /> : null}
            renderItem={({ item }) => (
              <CommentRow
                row={item}
                currentUserId={user?.id ?? ''}
                onPlay={setPlayUri}
                onReply={c => handleRecordComment(c.id)}
                onToggleExpand={toggleExpand}
                onContinue={handleContinue}
                onDelete={handleDelete}
                onEmojiTap={handleEmojiTap}
                onEmojiPick={c => setEmojiTarget(c)}
              />
            )}
          />
        )}

        {emojiTarget && (
          <EmojiPicker onPick={emoji => { handleEmojiTap(emojiTarget, emoji); setEmojiTarget(null); }} />
        )}

        <View style={[s.footer, { paddingBottom: bottom + SPACE.SM }]}>
          <TouchableOpacity
            style={s.commentBtn}
            onPress={() => handleRecordComment(focusRootId ?? undefined)}
            activeOpacity={0.85}>
            <Ionicons name="videocam" size={18} color={C.WHITE} />
            <Text style={s.commentBtnText}>{focusRootId ? 'Record Reply' : 'Record Comment'}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {playUri && <CommentVideoModal uri={playUri} onClose={() => setPlayUri(null)} />}
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 30 },
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.LG, paddingBottom: SPACE.MD },
  backBtn: { padding: SPACE.XS },
  headerTitle: { flex: 1, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, textAlign: 'center', paddingHorizontal: SPACE.XL },
  footer: { paddingHorizontal: SPACE.LG, paddingTop: SPACE.SM },
  commentBtn: { backgroundColor: C.ACCENT, borderRadius: RADIUS.MD, paddingVertical: SPACE.LG, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.SM },
  commentBtnText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD },
});
