import React from 'react';
import { Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { BlobEmoji, hasBlob, BLOB_KEYS } from './blobEmoji';

// Branded emoji art is now a set of animated "blob" characters (see ./blobEmoji): each gently breathes
// on idle and plays an expressive burst when tapped. The unicode char stays the canonical DB key; an
// emoji with blob art renders the blob, anything else falls back to the plain unicode glyph.

// Canonical reaction set = every emoji we have a blob for (single source of truth in ./blobEmoji), so
// adding a blob automatically makes it a quick reaction. Use this everywhere instead of a literal list.
export const QUICK_EMOJIS = BLOB_KEYS;

export function hasCustomArt(emoji: string): boolean {
  return hasBlob(emoji);
}

export default function EmojiGlyph({
  emoji, size = 24, style, onPress, excited,
}: {
  emoji: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  // When provided, the blob becomes tappable: it plays its expressive animation, then calls this.
  onPress?: () => void;
  // Alternative trigger for sites that own their own touchable: bump this number to play the burst.
  excited?: number;
}) {
  if (hasBlob(emoji)) {
    return <BlobEmoji emoji={emoji} size={size} style={style} onPress={onPress} excited={excited} />;
  }
  return <Text style={[{ fontSize: size }, style as StyleProp<TextStyle>]}>{emoji}</Text>;
}
