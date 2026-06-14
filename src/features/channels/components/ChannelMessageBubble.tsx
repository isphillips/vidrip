import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Modal,
} from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import type { ChannelPost } from '../../../infrastructure/supabase/queries/channels';

import EmojiGlyph, { QUICK_EMOJIS } from '../../../components/EmojiGlyph';
import Handle from '../../../components/Handle';
import Ionicons from 'react-native-vector-icons/Ionicons';

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isToday) { return time; }
  if (isYesterday) { return `Yesterday ${time}`; }
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

function buildEmojiSummary(reactions: { emoji: string; user_id: string }[]) {
  const counts: Record<string, number> = {};
  for (const r of reactions) { counts[r.emoji] = (counts[r.emoji] ?? 0) + 1; }
  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  return { shown: sorted.slice(0, 2), overflow: Math.max(0, sorted.length - 2) };
}

type Props = {
  post: ChannelPost;
  isMe: boolean;
  userId: string | undefined;
  onPress: () => void;
  onEmojiToggle: (emoji: string) => void;
  onDelete: () => void;
};

export default function ChannelMessageBubble({
  post, isMe, onPress, onEmojiToggle, onDelete,
}: Props) {
  const [pickerVisible, setPickerVisible] = useState(false);

  if (post.post_type === 'status') {
    return (
      <View style={styles.statusRow}>
        <Text style={styles.statusText}>{post.message ?? ''}</Text>
      </View>
    );
  }

  const handleLongPress = () => {
    if (isMe) {
      Alert.alert('', '', [
        { text: 'Delete message', style: 'destructive', onPress: onDelete },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      setPickerVisible(true);
    }
  };

  const { shown, overflow } = buildEmojiSummary(post.emoji_reactions);
  const hasReactions = post.emoji_reactions.length > 0;

  return (
    <View style={[styles.row, isMe ? styles.rowMe : styles.rowThem]}>
      <View style={styles.group}>
        {!isMe && <Handle userId={post.poster_id} handle={post.poster?.handle ?? '?'} style={styles.handle} />}
        <Text style={[styles.time, isMe && styles.timeMe]}>
          {formatTime(post.created_at)}
        </Text>

        {/* Bubble + emoji badge container */}
        <View style={[styles.bubbleWrap, hasReactions && styles.bubbleWrapReactions]}>
          {/* Emoji badge: top-right for received, top-left for sent */}
          {hasReactions && (
            <View style={[styles.emojiTag, isMe ? styles.emojiTagLeft : styles.emojiTagRight]}>
              {shown.map(([emoji]) => (
                <EmojiGlyph key={emoji} emoji={emoji} size={32} />
              ))}
              {overflow > 0 && (
                <Text style={styles.emojiTagOverflow}>+{overflow}</Text>
              )}
            </View>
          )}

          <TouchableOpacity
            onPress={onPress}
            onLongPress={handleLongPress}
            delayLongPress={400}
            activeOpacity={0.85}
            style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
            <View style={styles.clipRow}>
              <View style={styles.playCircle}>
                {post.post_type === 'audio'
                  ? <Ionicons name="mic" size={16} color={C.WHITE} />
                  : <Text style={styles.playIcon}>▶</Text>
                }
              </View>
              <Text style={[styles.duration, isMe && styles.durationMe]}>
                {post.duration ?? 0}s {post.post_type === 'audio' ? 'audio' : 'video'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Emoji picker modal — only for others' posts */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}>
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setPickerVisible(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerLabel}>React</Text>
            <View style={styles.pickerRow}>
              {QUICK_EMOJIS.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.pickerBtn}
                  onPress={() => { onEmojiToggle(emoji); setPickerVisible(false); }}>
                  <EmojiGlyph emoji={emoji} size={42} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS, flexDirection: 'row' },
  rowMe: { justifyContent: 'flex-end' },
  rowThem: { justifyContent: 'flex-start' },
  group: { maxWidth: '72%', gap: 3 },
  time: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, color: C.SUBTLE },
  timeMe: { textAlign: 'right' },
  handle: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM, color: C.ACCENT_HOT },

  bubbleWrap: {},
  bubbleWrapReactions: { marginTop: SPACE.MD },  // only when emoji badge needs space above

  // Emoji reaction badge
  emojiTag: {
    position: 'absolute',
    top: -SPACE.LG,
    flexDirection: 'row', alignItems: 'center', gap: 1,
    zIndex: 1,
  },
  emojiTagLeft: { left: 4 },
  emojiTagRight: { right: 4 },
  emojiTagChar: { fontSize: 13 },
  emojiTagOverflow: { fontSize: FONT.SIZES.XS, color: C.MUTED, fontFamily: FONT.BODY_MEDIUM },

  bubble: { borderRadius: RADIUS.LG, paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM },
  bubbleMe: { backgroundColor: C.ACCENT, borderBottomRightRadius: RADIUS.SM },
  bubbleThem: { backgroundColor: C.SURFACE_2, borderBottomLeftRadius: RADIUS.SM },

  clipRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM },
  playCircle: {
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  playIcon: { color: C.WHITE, fontSize: 14, marginLeft: 2 },
  clipIcon: { width: 16, height: 16, tintColor: C.WHITE },
  duration: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  durationMe: { color: 'rgba(255,255,255,0.85)' },

  // Status message
  statusRow: { alignItems: 'center', paddingVertical: SPACE.XS, paddingHorizontal: SPACE.XL },
  statusText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, color: C.SUBTLE, textAlign: 'center' },

  // Emoji picker modal
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: C.SURFACE,
    borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG,
    padding: SPACE.LG, gap: SPACE.MD,
  },
  pickerLabel: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED, textAlign: 'center' },
  pickerRow: { flexDirection: 'row', justifyContent: 'space-around' },
  pickerBtn: { padding: SPACE.SM },
  pickerEmoji: { fontSize: 30 },
});
