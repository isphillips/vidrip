import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import EmojiChips from '../../../components/EmojiChips';
import type { ChannelPost } from '../../../infrastructure/supabase/queries/channels';

type Props = {
  post: ChannelPost;
  userId: string | undefined;
  isOwner?: boolean;
  onPress: () => void;
  onEmojiToggle: (emoji: string) => void;
  onTogglePin?: () => void;
};

export default function ChannelPostCard({ post, userId, isOwner, onPress, onEmojiToggle, onTogglePin }: Props) {
  const thumbnail =
    post.post_type === 'youtube'
      ? (post.yt_video_thumbnail ?? `https://img.youtube.com/vi/${post.yt_video_id}/hqdefault.jpg`)
      : null;

  const title =
    post.post_type === 'youtube'
      ? (post.yt_video_title ?? 'YouTube video')
      : `${post.duration ?? 0}s video from @${post.poster?.handle ?? '?'}`;

  return (
    // Outer View — not a touchable, so the pin button never competes with card navigation
    <View style={[styles.card, post.is_pinned && styles.cardPinned]}>

      {/* Pin row sits outside the pressable area */}
      {(post.is_pinned || isOwner) && (
        <View style={styles.topRow}>
          {post.is_pinned
            ? <Text style={styles.pinnedText}>📌 Pinned</Text>
            : <View />
          }
          {isOwner && (
            <TouchableOpacity onPress={onTogglePin} hitSlop={8} style={styles.pinBtn}>
              <Text style={styles.pinBtnText}>{post.is_pinned ? 'Unpin' : 'Pin'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Tappable content area */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <View style={styles.row}>
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Text style={styles.thumbIcon}>▶</Text>
            </View>
          )}

          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
            <View style={styles.meta}>
              <Text style={styles.poster}>@{post.poster?.handle ?? '?'}</Text>
              {post.post_type === 'youtube' && post.reaction_count > 0 && (
                <Text style={styles.reactionCount}>
                  {post.reaction_count} reaction{post.reaction_count !== 1 ? 's' : ''}
                </Text>
              )}
            </View>
            <EmojiChips
              reactions={post.emoji_reactions}
              userId={userId}
              onToggle={onEmojiToggle}
            />
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
    paddingHorizontal: SPACE.LG,
    paddingVertical: SPACE.MD,
    gap: SPACE.SM,
  },
  cardPinned: {
    backgroundColor: C.SURFACE_2,
    borderBottomColor: C.BORDER_STRONG,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 18,
  },
  pinnedText: {
    fontSize: FONT.SIZES.XS,
    fontFamily: FONT.BODY_MEDIUM,
    color: C.MUTED,
  },
  pinBtn: {
    paddingHorizontal: SPACE.SM,
    paddingVertical: 2,
    borderRadius: RADIUS.FULL,
    backgroundColor: C.SURFACE_2,
    borderWidth: 1,
    borderColor: C.BORDER_STRONG,
  },
  pinBtnText: {
    fontSize: FONT.SIZES.XS,
    fontFamily: FONT.BODY_MEDIUM,
    color: C.MUTED,
  },
  row: { flexDirection: 'row', gap: SPACE.MD, alignItems: 'flex-start' },
  thumb: {
    width: 96, height: 64,
    borderRadius: RADIUS.SM,
    backgroundColor: C.BG_SOLID,
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbIcon: { color: C.SUBTLE, fontSize: 22 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM },
  reactionCount: {
    fontSize: FONT.SIZES.XS,
    fontFamily: FONT.BODY,
    color: C.SUBTLE,
  },
  info: { flex: 1, gap: SPACE.XS },
  title: {
    fontSize: FONT.SIZES.MD,
    fontFamily: FONT.BODY_MEDIUM,
    color: C.INK,
    lineHeight: 20,
  },
  poster: {
    fontSize: FONT.SIZES.XS,
    fontFamily: FONT.BODY,
    color: C.SUBTLE,
  },
});
