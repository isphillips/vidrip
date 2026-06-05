import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import EmojiGlyph, { QUICK_EMOJIS } from './EmojiGlyph';

export type EmojiReactionItem = { emoji: string; user_id: string };

type Props = {
  reactions: EmojiReactionItem[];
  userId: string | undefined;
  onToggle: (emoji: string) => void;
};

export default function EmojiChips({ reactions, userId, onToggle }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const counts = (reactions ?? []).reduce((acc: Record<string, number>, e) => {
    acc[e.emoji] = (acc[e.emoji] ?? 0) + 1;
    return acc;
  }, {});
  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  const top3 = sorted.slice(0, 3);
  const overflow = sorted.length - 3;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {top3.map(([emoji, count]) => {
          const isMine = (reactions ?? []).some(r => r.emoji === emoji && r.user_id === userId);
          return (
            <TouchableOpacity
              key={emoji}
              style={[styles.chip, isMine && styles.chipMine]}
              onPress={() => onToggle(emoji)}
              activeOpacity={0.7}
              hitSlop={4}>
              <EmojiGlyph emoji={emoji} size={14} />
              <Text style={styles.count}>{count}</Text>
            </TouchableOpacity>
          );
        })}
        {overflow > 0 && (
          <View style={styles.chip}>
            <Text style={styles.count}>+{overflow}</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setPickerOpen(o => !o)}
          hitSlop={4}>
          <Text style={styles.addGlyph}>{pickerOpen ? '✕' : '+'}</Text>
        </TouchableOpacity>
      </View>

      {pickerOpen && (
        <View style={styles.picker}>
          {QUICK_EMOJIS.map(emoji => (
            <TouchableOpacity
              key={emoji}
              onPress={() => { onToggle(emoji); setPickerOpen(false); }}
              hitSlop={4}>
              <EmojiGlyph emoji={emoji} size={24} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export const styles = StyleSheet.create({
  wrap: { flexShrink: 0, gap: 4 },
  row: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  chipMine: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  glyph: { fontSize: 13 },
  count: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  addBtn: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  addGlyph: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '700', lineHeight: 16 },
  picker: {
    flexDirection: 'row', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  pickerGlyph: { fontSize: 22 },
});
