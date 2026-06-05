import React from 'react';
import { Image, Text, type ImageStyle, type TextStyle } from 'react-native';

// Custom emoji art. The unicode char remains the canonical key stored in the DB;
// this maps each key to its branded PNG. Unmapped keys fall back to the glyph.
const EMOJI_ART: Record<string, any> = {
  '❤️': require('../assets/emoji-heart.png'),
  '😂': require('../assets/emoji-laugh.png'),
  '😮': require('../assets/emoji-surprised.png'),
  '🔥': require('../assets/emoji-fire.png'),
  '👏': require('../assets/emoji-clap.png'),
  '😭': require('../assets/emoji-cry.png'),
};

// Canonical reaction set — use everywhere instead of hardcoding the unicode list.
export const QUICK_EMOJIS = ['❤️', '😂', '😮', '🔥', '👏', '😭'];

export function hasCustomArt(emoji: string): boolean {
  return !!EMOJI_ART[emoji];
}

export default function EmojiGlyph({
  emoji, size = 24, style,
}: {
  emoji: string;
  size?: number;
  style?: ImageStyle | TextStyle;
}) {
  const art = EMOJI_ART[emoji];
  if (art) {
    return (
      <Image
        source={art}
        style={[{ width: size, height: size }, style as ImageStyle]}
        resizeMode="contain"
      />
    );
  }
  return <Text style={[{ fontSize: size }, style as TextStyle]}>{emoji}</Text>;
}
