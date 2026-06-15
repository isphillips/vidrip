import React, { useState } from 'react';
import { Text, View, type TextStyle } from 'react-native';
import RAnimated, { useAnimatedStyle } from 'react-native-reanimated';
import { useClock, triangle, sawtooth } from '../effectClock';
import { FONT } from '../../../theme';

export type TextAnim = 'none' | 'bounce' | 'pulse' | 'marquee';

export type EffectTextProps = {
  text: string;
  color?: string;
  font?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  anim?: TextAnim;
};

// Clock-driven animated text — the single renderer used by both the editor overlay and the
// replay EffectLayer, so a text sticker looks identical in editing and playback.
export default function EffectText({ text, color, font, fontSize, bold, italic, anim = 'none' }: EffectTextProps) {
  const clock = useClock();
  const [measuredW, setMeasuredW] = useState(160);

  const baseStyle: TextStyle = {
    color: color ?? '#FFFFFF',
    fontFamily: font ?? FONT.DISPLAY_BOLD,
    fontSize: fontSize ?? 30,
    fontWeight: bold ? '700' : 'normal',
    fontStyle: italic ? 'italic' : 'normal',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  };

  const bounceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -18 * triangle(clock.value, 0, 800) }] }));
  const pulseStyle  = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.2 * triangle(clock.value, 0, 1300) }] }));
  const CONT = 200;
  const marqueeStyle = useAnimatedStyle(() => {
    // Scroll right→left over 3200ms, then a 400ms gap (4 = 3600ms cycle), matching the editor.
    const p = sawtooth(clock.value, 0, 3600);
    const scroll = Math.min(1, (p * 3600) / 3200);
    return { transform: [{ translateX: CONT + scroll * (-(measuredW + 20) - CONT) }] };
  });

  if (anim === 'bounce') { return <RAnimated.Text style={[baseStyle, bounceStyle]}>{text}</RAnimated.Text>; }
  if (anim === 'pulse')  { return <RAnimated.Text style={[baseStyle, pulseStyle]}>{text}</RAnimated.Text>; }
  if (anim === 'marquee') {
    return (
      <View style={{ width: CONT, overflow: 'hidden' }}>
        <RAnimated.Text
          style={[baseStyle, marqueeStyle]}
          onLayout={e => setMeasuredW(e.nativeEvent.layout.width)}
          numberOfLines={1}>
          {text}
        </RAnimated.Text>
      </View>
    );
  }
  return <Text style={baseStyle}>{text}</Text>;
}
