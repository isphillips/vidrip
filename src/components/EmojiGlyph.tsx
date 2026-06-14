import React from 'react';
import { Image, Text, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

// Branded emoji art lives in a single 3×2 sprite sheet (emojis.png). The unicode
// char stays the canonical DB key; each maps to a cell that we crop out, so there's
// one source image instead of six files. Unmapped keys fall back to the glyph.
const SPRITE = require('../assets/emojis.png');
const COLS = 3;
const ROWS = 2;

// [col, row] in the sheet — Row 1: ❤️ 😂 😮, Row 2: 🔥 👏 😭.
const EMOJI_CELL: Record<string, [number, number]> = {
  '❤️': [0, 0],
  '😂': [1, 0],
  '😮': [2, 0],
  '🔥': [0, 1],
  '👏': [1, 1],
  '😭': [2, 1],
};

// Canonical reaction set — use everywhere instead of hardcoding the unicode list.
export const QUICK_EMOJIS = ['❤️', '😂', '😮', '🔥', '👏', '😭'];

export function hasCustomArt(emoji: string): boolean {
  return !!EMOJI_CELL[emoji];
}

export default function EmojiGlyph({
  emoji, size = 24, style,
}: {
  emoji: string;
  size?: number;
  style?: ImageStyle | TextStyle;
}) {
  const cell = EMOJI_CELL[emoji];
  if (cell) {
    const [col, row] = cell;
    return (
      <View style={[{ width: size, height: size, overflow: 'hidden' }, style as unknown as ViewStyle]}>
        <Image
          source={SPRITE}
          style={{
            width: size * COLS,
            height: size * ROWS,
            transform: [{ translateX: -size * col }, { translateY: -size * row }],
          }}
          resizeMode="stretch"
        />
      </View>
    );
  }
  return <Text style={[{ fontSize: size }, style as TextStyle]}>{emoji}</Text>;
}
