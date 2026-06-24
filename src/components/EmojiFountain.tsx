import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import EmojiGlyph from './EmojiGlyph';

// A full-screen, pointer-transparent overlay that launches emoji from the bottom-centre in a random
// arc (peaking 50–75% up the screen), then fades + scales them down on the way back down. Imperative:
// call ref.emit(emoji) to throw one. Used both while RECORDING a reaction (the reactor spams them) and
// on PLAYBACK (we re-emit at the same video times so the viewer sees them land identically).

export type EmojiFountainHandle = { emit: (emoji: string) => void };

// One recorded emoji throw: which emoji `e`, at video time `t` (seconds from the reaction's start).
// On playback we re-emit at `t` with a fresh random arc (the trajectory isn't stored).
export type EmojiHit = { e: string; t: number };

type Particle = { id: number; emoji: string; peak: number; drift: number };
const SIZE = 46;
const DURATION = 1700;

function FlyingEmoji({ emoji, peak, drift, onDone }: { emoji: string; peak: number; drift: number; onDone: () => void }) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(p, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: true })
      .start(({ finished }) => { if (finished) { onDone(); } });
  }, [p, onDone]);

  // Parabolic rise→fall (sine-shaped via interpolation); horizontal drift gives the arc.
  const translateY = p.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -peak * 0.707, -peak, -peak * 0.707, 0] });
  const translateX = p.interpolate({ inputRange: [0, 1], outputRange: [0, drift] });
  // Pop in, hold through the rise, then fade out as it falls (p > 0.5 = descending).
  const opacity = p.interpolate({ inputRange: [0, 0.1, 0.55, 1], outputRange: [0, 1, 1, 0] });
  const scale = p.interpolate({ inputRange: [0, 0.12, 0.55, 1], outputRange: [0.4, 1, 1, 0.3] });

  return (
    <Animated.View pointerEvents="none" style={[styles.particle, { opacity, transform: [{ translateX }, { translateY }, { scale }] }]}>
      <EmojiGlyph emoji={emoji} size={SIZE} />
    </Animated.View>
  );
}

const EmojiFountain = forwardRef<EmojiFountainHandle>(function EmojiFountain(_props, ref) {
  const { width, height } = useWindowDimensions();
  const [parts, setParts] = useState<Particle[]>([]);
  const idRef = useRef(0);

  useImperativeHandle(ref, () => ({
    emit: (emoji: string) => {
      const id = ++idRef.current;
      const peak = height * (0.5 + Math.random() * 0.25);     // 50–75% up the screen
      const drift = (Math.random() * 2 - 1) * width * 0.2;    // random sideways arc
      setParts(prev => [...prev, { id, emoji, peak, drift }]);
    },
  }), [height, width]);

  const remove = useCallback((id: number) => setParts(prev => prev.filter(x => x.id !== id)), []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {parts.map(pt => (
        // Each particle launches from the bottom-centre; transforms are relative to this anchor.
        <View key={pt.id} pointerEvents="none" style={[styles.anchor, { left: width / 2 - SIZE / 2 }]}>
          <FlyingEmoji emoji={pt.emoji} peak={pt.peak} drift={pt.drift} onDone={() => remove(pt.id)} />
        </View>
      ))}
    </View>
  );
});

export default EmojiFountain;

const styles = StyleSheet.create({
  anchor: { position: 'absolute', bottom: 96, width: SIZE, height: SIZE },
  particle: { position: 'absolute' },
});
