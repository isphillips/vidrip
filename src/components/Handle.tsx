import React from 'react';
import { Text, StyleSheet, type TextStyle, type StyleProp } from 'react-native';
import { openProfile } from '../store/profileDrawerStore';

// A tappable @handle that opens the global profile drawer. Pass userId when available
// (preferred); handle alone also works (the drawer resolves it).
export default function Handle({
  userId, handle, style, withAt = true, numberOfLines,
}: {
  userId?: string;
  handle: string;
  style?: StyleProp<TextStyle>;
  withAt?: boolean;
  numberOfLines?: number;
}) {
  // alignSelf:'flex-start' stops the Text from stretching to its container's full
  // width (the default in a flex column), which would make onPress fire across the
  // whole row. With it, the press frame is only as wide as the @handle glyphs.
  // (Ignored when Handle is used inline inside a parent <Text>, which is fine.)
  return (
    <Text
      style={[styles.base, style]}
      numberOfLines={numberOfLines}
      suppressHighlighting
      onPress={() => openProfile({ userId, handle })}>
      {withAt ? '@' : ''}{handle}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { alignSelf: 'flex-start' },
});
