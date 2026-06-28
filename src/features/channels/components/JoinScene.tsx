import React from 'react';
import { View, StyleSheet } from 'react-native';
import { type SharedValue } from 'react-native-reanimated';
import {
  W, H, SceneBackdrop, HeroDrippy, MiniSlime, PINK, MAGENTA, TEAL, GOLD,
} from '../../../components/scene/sceneKit';

// An inviting slice of Dripville for "join" prompts: the shared gradient world (sky + hills + stars +
// fireflies + balloons) with Drippy front-and-centre waving you in, flanked by a little crew of friends
// all waving hello. Same sceneKit language as the auth/onboarding scenes. Driven by `enter` (mount fade).
//
// Render it as an absolute-fill background; lay your copy + CTA over the lower half (the huddle owns the
// top). pointerEvents='none' throughout so taps pass straight to the buttons above it.
const HERO_W = Math.min(120, W * 0.30);

export function JoinScene({ enter }: { enter: SharedValue<number> }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The gradient world — no loafing crew (the waving huddle below is the focus), balloons kept for life. */}
      <SceneBackdrop enter={enter} showCrew={false} showBalloons />

      {/* Drippy, waving you in from up top */}
      <View style={styles.hero}>
        <HeroDrippy enter={enter} width={HERO_W} />
      </View>

      {/* …and friends, flanking him, all waving hello */}
      <MiniSlime left={W * 0.10} top={H * 0.30} size={48} colors={[TEAL, '#1f9c8c']} accessory="party" delay={420} waves mouth="grin" sparkle />
      <MiniSlime left={W * 0.75} top={H * 0.32} size={44} colors={[GOLD, '#E08A1E']} accessory="bow" delay={620} waves mouth="smile" />
      <MiniSlime left={W * 0.30} top={H * 0.42} size={32} colors={[PINK, MAGENTA]} accessory="crown" delay={820} waves mouth="smile" sparkle />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { position: 'absolute', left: 0, right: 0, top: H * 0.12, alignItems: 'center' },
});
