import React, { useState } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Video from 'react-native-video';
import { EffectClockProvider } from '../effectClock';
import EffectLayer from './EffectLayer';
import { isEmptyRecipe, type OverlayRecipe } from '../effectRecipe';

// In-app replay: plays the (already trim/colour/mirror-baked) source video and reconstructs
// the animated overlay layer live on top. The effect clock is gated to the play state, so
// the overlays pause/seek with the video. Nothing is baked unless the user shares out.
export default function EffectPlayer({
  uri, recipe, paused = false, repeat = true, muted = false, resizeMode = 'contain', style, onLoad,
}: {
  uri: string;
  recipe?: OverlayRecipe | null;
  paused?: boolean;
  repeat?: boolean;
  muted?: boolean;
  resizeMode?: 'contain' | 'cover' | 'stretch';
  style?: StyleProp<ViewStyle>;
  onLoad?: () => void;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const showFx = !isEmptyRecipe(recipe);
  return (
    <View
      style={[styles.fill, style]}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setBox(p => (p.w === width && p.h === height ? p : { w: width, h: height }));
      }}>
      <Video
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode={resizeMode}
        repeat={repeat}
        paused={paused}
        muted={muted}
        onLoad={onLoad}
      />
      {showFx && box.w > 0 && (
        // One shared clock for the whole layer, advancing only while playing.
        <EffectClockProvider playing={!paused}>
          <EffectLayer recipe={recipe!} width={box.w} height={box.h} />
        </EffectClockProvider>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { overflow: 'hidden' } });
