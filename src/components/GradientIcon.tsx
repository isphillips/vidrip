import React from 'react';
import { View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';

// The brand sweep — pink → purple → teal — used across Studio + branded glyphs.
export const BRAND_GRADIENT = ['#FF4FA3', '#A05CFF', '#2DD4BF'];

// An Ionicon filled with a gradient (diagonal by default). Used for branded action
// icons. The icon glyph is the mask; the gradient shows through it.
export default function GradientIcon({
  name, size = 26, colors = BRAND_GRADIENT,
  start = { x: 0, y: 0 }, end = { x: 1, y: 1 },
}: {
  name: string;
  size?: number;
  colors?: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}) {
  return (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={name} size={size} color="#000" />
        </View>
      }>
      <LinearGradient colors={colors} start={start} end={end} style={{ width: size, height: size }} />
    </MaskedView>
  );
}
