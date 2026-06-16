import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Handle from '../../../components/Handle';
import EmojiGlyph from '../../../components/EmojiGlyph';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useCommentThumbnail } from '../useCommentThumbnail';
import type { ThreadRow } from '../commentTree';
import type { VideoComment } from '../../../infrastructure/supabase/queries/videoComments';

const INDENT = 14;

export interface CommentRowProps {
  row: ThreadRow;
  currentUserId: string;
  onPlay: (uri: string) => void;
  onReply: (c: VideoComment) => void;
  onToggleExpand: (c: VideoComment) => void;
  onContinue: (commentId: string) => void;
  onDelete: (c: VideoComment) => void;
  onEmojiTap: (c: VideoComment, emoji: string) => void;
  onEmojiPick: (c: VideoComment) => void;
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
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function CommentRow({
  row, currentUserId, onPlay, onReply, onToggleExpand, onContinue, onDelete, onEmojiTap, onEmojiPick,
}: CommentRowProps) {
  const { comment, depth, hasReplies, isExpanded, isContinue } = row;
  const thumb = useCommentThumbnail(comment);
  // A stored thumbnail URL can 404 for older comments posted before thumbnails existed —
  // fall back to the plain play tile if the image fails to load.
  const [thumbErr, setThumbErr] = useState(false);
  useEffect(() => { setThumbErr(false); }, [thumb]);
  const showThumb = thumb && !thumbErr;

  // One vertical thread line per ancestor level — the Reddit-style "who replied to whom".
  const lines = [];
  for (let i = 0; i < depth; i++) { lines.push(<View key={i} style={cr.line} />); }

  if (isContinue) {
    return (
      <View style={cr.wrap}>
        {lines}
        <TouchableOpacity style={cr.continueBtn} onPress={() => onContinue(comment.id)} activeOpacity={0.7}>
          <Ionicons name="git-branch-outline" size={13} color={C.ACCENT} />
          <Text style={cr.continueTxt}>Continue this thread →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ts = formatAge(comment.created_at);
  const dur = comment.duration ? formatDur(comment.duration) : null;
  const playable = comment.video_url ?? comment.local_path ?? null;
  const isOwner = comment.author_id === currentUserId;

  // Aggregate optimistic emoji reactions (emoji → count + whether the viewer reacted).
  const emojiMap = new Map<string, { count: number; mine: boolean }>();
  (comment as any).emoji_reactions?.forEach((r: { emoji: string; user_id: string }) => {
    const prev = emojiMap.get(r.emoji) ?? { count: 0, mine: false };
    emojiMap.set(r.emoji, { count: prev.count + 1, mine: prev.mine || r.user_id === currentUserId });
  });
  const emojiEntries = [...emojiMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 4);

  const repliesLabel = isExpanded
    ? 'Hide replies'
    : comment.reply_count > 0
      ? `${comment.reply_count} ${comment.reply_count === 1 ? 'reply' : 'replies'}`
      : 'View replies';

  return (
    <View style={cr.wrap}>
      {lines}
      <View style={cr.content}>
        {/* Small video-frame thumbnail */}
        <TouchableOpacity style={cr.thumb} onPress={() => playable && onPlay(playable)} activeOpacity={0.85}>
          {showThumb
            ? <Image source={{ uri: thumb! }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setThumbErr(true)} />
            : <View style={[StyleSheet.absoluteFill, cr.thumbBg]} />}
          <View style={cr.thumbOverlay}>
            <Ionicons name={playable ? 'play' : 'hourglass-outline'} size={16} color="#fff" />
          </View>
          {dur && <Text style={cr.dur}>{dur}</Text>}
        </TouchableOpacity>

        <View style={cr.right}>
          <View style={cr.headerRow}>
            <Handle userId={comment.author_id} handle={comment.author_handle} style={cr.handle} />
            <Text style={cr.time} numberOfLines={1}> · {comment.is_friend ? '👤 ' : ''}{ts}</Text>
            <View style={{ flex: 1 }} />
            {isOwner && (
              <TouchableOpacity onPress={() => onDelete(comment)} hitSlop={8} style={cr.iconBtn}>
                <Ionicons name="trash-outline" size={14} color={C.MUTED} />
              </TouchableOpacity>
            )}
          </View>

          <View style={cr.actions}>
            {emojiEntries.map(([emoji, { count, mine }]) => (
              <TouchableOpacity key={emoji} style={[cr.chip, mine && cr.chipMine]} onPress={() => onEmojiTap(comment, emoji)}>
                <EmojiGlyph emoji={emoji} size={13} />
                <Text style={cr.chipTxt}> {count}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={cr.iconBtn} onPress={() => onEmojiPick(comment)} hitSlop={4}>
              <Ionicons name="happy-outline" size={16} color={C.MUTED} />
            </TouchableOpacity>
            <TouchableOpacity style={cr.replyBtn} onPress={() => onReply(comment)} hitSlop={4}>
              <Ionicons name="arrow-undo-outline" size={13} color={C.MUTED} />
              <Text style={cr.replyTxt}>Reply</Text>
            </TouchableOpacity>
          </View>

          {hasReplies && (
            <TouchableOpacity style={cr.repliesToggle} onPress={() => onToggleExpand(comment)} hitSlop={6}>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={C.ACCENT} />
              <Text style={cr.repliesTxt}>{repliesLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

export default React.memo(CommentRow);

const cr = StyleSheet.create({
  wrap:    { flexDirection: 'row', paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS, alignItems: 'stretch' },
  line:    { width: INDENT, borderLeftWidth: 1.5, borderLeftColor: C.BORDER, marginLeft: 5 },
  content: { flex: 1, flexDirection: 'row', gap: SPACE.SM, paddingLeft: SPACE.XS },

  thumb:        { width: 52, height: 68, borderRadius: RADIUS.SM, overflow: 'hidden', backgroundColor: '#000' },
  thumbBg:      { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  thumbOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  dur:          { position: 'absolute', bottom: 3, right: 3, color: C.WHITE, fontSize: 9, fontFamily: FONT.BODY_MEDIUM, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 3, borderRadius: 3 },

  right:     { flex: 1, gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  handle:    { color: C.INK, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD },
  time:      { color: C.MUTED, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, flexShrink: 1 },

  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SPACE.XS },
  chip:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.SURFACE_2, borderRadius: RADIUS.FULL, paddingHorizontal: SPACE.SM, paddingVertical: 2, borderWidth: 1, borderColor: C.BORDER },
  chipMine:{ borderColor: C.ACCENT },
  chipTxt: { color: C.INK, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY },
  iconBtn: { padding: SPACE.XS },
  replyBtn:{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: SPACE.SM, paddingVertical: 3, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE_2, borderWidth: 1, borderColor: C.BORDER },
  replyTxt:{ color: C.MUTED, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM },

  repliesToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  repliesTxt:    { color: C.ACCENT, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_SEMIBOLD },

  continueBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: SPACE.SM, paddingLeft: SPACE.XS },
  continueTxt: { color: C.ACCENT, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD },
});
