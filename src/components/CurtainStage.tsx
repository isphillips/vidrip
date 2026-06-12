import React, { useEffect } from 'react';
import {
  View, Image, StyleSheet, useWindowDimensions,
  type ViewStyle, type StyleProp,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing,
} from 'react-native-reanimated';

const CURTAIN_BACK = require('../assets/curtain-back.png');
const CURTAIN_FRONT = require('../assets/curtain-front.png');

/**
 * Theatrical backdrop layered over whatever sits behind it (the app's purple
 * ScreenGradient on the onboarding screen):
 *   curtain-back.png → the closed curtain (raises off the top when `raised`)
 *   curtain-front.png → the proscenium frame (stays put, transparent center)
 * Children render on top of all layers.
 */
export default function CurtainStage({
  raised = false,
  scrim = 0.32,
  idleLift = 0.06,
  children,
  style,
}: {
  raised?: boolean;
  scrim?: number;
  /** Fraction of screen height the closed curtain sits raised at idle (0 = fully down). */
  idleLift?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { height } = useWindowDimensions();
  const t = useSharedValue(raised ? 1 : 0);

  useEffect(() => {
    // Slow, weighty raise; quicker drop when closing.
    t.value = withTiming(raised ? 1 : 0, {
      duration: raised ? 3200 : 1200,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [raised, t]);

  // Idle: lifted a touch. Raised: fully off the top.
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -height * (idleLift + (1.05 - idleLift) * t.value) }],
  }));

  return (
    <View style={[styles.root, style]}>
      <Animated.Image source={CURTAIN_BACK} style={[styles.layer, backStyle]} resizeMode="stretch" />
      <Image source={CURTAIN_FRONT} style={styles.layer} resizeMode="stretch" pointerEvents="none" />
      {scrim > 0 && (
        <View pointerEvents="none" style={[styles.layer, { backgroundColor: `rgba(12,10,9,${scrim})` }]} />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  layer: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
});
