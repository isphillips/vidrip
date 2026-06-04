import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import EmojiChips from '../../../components/EmojiChips';
import type { ChannelPost } from '../../../infrastructure/supabase/queries/channels';

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) { return time; }
  if (isYesterday) { return `Yesterday ${time}`; }
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

type Props = {
  post: ChannelPost;
  isMe: boolean;
  userId: string | undefined;
  onPress: () => void;
  onEmojiToggle: (emoji: string) => void;
};

export default function ChannelMessageBubble({
  post, isMe, userId, onPress, onEmojiToggle,
}: Props) {
  return (
    <View style={[styles.row, isMe ? styles.rowMe : styles.rowThem]}>
      <View style={styles.group}>
        {/* Date/time above each entry */}
        <Text style={[styles.time, isMe && styles.timeMe]}>
          {formatTime(post.created_at)}
        </Text>

        {/* Sender handle — only on their side */}
        {!isMe && (
          <Text style={styles.handle}>@{post.poster?.handle ?? '?'}</Text>
        )}

        {/* Clip / audio bubble */}
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.85}
          style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <View style={styles.clipRow}>
            <View style={styles.playCircle}>
              {post.post_type === 'audio'
                ? <Image source={require('../../../assets/icon-audio.png')} style={styles.audioIcon} resizeMode="contain" />
                : <Text style={styles.playIcon}>▶</Text>
              }
            </View>
            <Text style={[styles.duration, isMe && styles.durationMe]}>
              {post.duration ?? 0}s {post.post_type === 'audio' ? 'audio' : 'video'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Emoji reactions */}
        {post.emoji_reactions.length > 0 && (
          <View style={[styles.emojiWrap, isMe && styles.emojiWrapMe]}>
            <EmojiChips
              reactions={post.emoji_reactions}
              userId={userId}
              onToggle={onEmojiToggle}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: SPACE.MD,
    paddingVertical: SPACE.XS,
    flexDirection: 'row',
  },
  rowMe: { justifyContent: 'flex-end' },
  rowThem: { justifyContent: 'flex-start' },
  group: { maxWidth: '72%', gap: 3 },
  time: {
    fontSize: FONT.SIZES.XS,
    fontFamily: FONT.BODY,
    color: C.SUBTLE,
  },
  timeMe: { textAlign: 'right' },
  handle: {
    fontSize: FONT.SIZES.XS,
    fontFamily: FONT.BODY_MEDIUM,
    color: C.ACCENT_HOT,
  },
  bubble: {
    borderRadius: RADIUS.LG,
    paddingHorizontal: SPACE.MD,
    paddingVertical: SPACE.SM,
  },
  bubbleMe: {
    backgroundColor: C.ACCENT,
    borderBottomRightRadius: RADIUS.SM,
  },
  bubbleThem: {
    backgroundColor: C.SURFACE_2,
    borderBottomLeftRadius: RADIUS.SM,
  },
  clipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.SM,
  },
  playCircle: {
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  playIcon: { color: C.WHITE, fontSize: 14, marginLeft: 2 },
  audioIcon: { width: 16, height: 16, tintColor: C.WHITE },
  duration: {
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY_MEDIUM,
    color: C.MUTED,
  },
  durationMe: { color: 'rgba(255,255,255,0.85)' },
  emojiWrap: { alignSelf: 'flex-start' },
  emojiWrapMe: { alignSelf: 'flex-end' },
});
