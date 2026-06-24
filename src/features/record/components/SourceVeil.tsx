import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { C, FONT, SPACE } from '../../../theme';

export type VeilPlatform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'generic';

// Instagram's brand gradient (used for its play button).
const IG_GRADIENT = ['#FEDA75', '#FA7E1E', '#D62976', '#962FBF', '#4F5BD5'];

function PlayTriangle() {
  return <View style={styles.tri} />;
}

function BrandButton({ platform }: { platform: VeilPlatform }) {
  if (platform === 'instagram') {
    return (
      <LinearGradient colors={IG_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.btn, styles.btnShadow]}>
        <PlayTriangle />
      </LinearGradient>
    );
  }
  const bg =
    platform === 'youtube' ? '#FF0000' :
    platform === 'facebook' ? '#1877F2' :
    platform === 'tiktok' ? '#000000' :
    'rgba(20,20,22,0.92)';   // generic / studio
  return (
    <View style={[styles.btn, styles.btnShadow, { backgroundColor: bg }, platform === 'tiktok' && styles.tiktokGlow]}>
      <PlayTriangle />
    </View>
  );
}

export interface SourceVeilProps {
  platform: VeilPlatform;
  /** A still frame to blur as the backdrop. Falls back to a frosted scrim when null. */
  thumbUri?: string | null;
  /** When set, the veil is tappable and calls this — for file players that need an explicit play().
   *  When omitted, the veil is pointer-transparent so the tap reaches the embedded player underneath. */
  onPress?: () => void;
}

/**
 * Pre-record veil: obscures an external source video behind a heavy blur (of its own
 * first frame) + a crisp, platform-branded play button, until the user taps to play
 * (which also starts recording). Shown only before the source begins playing.
 */
export default function SourceVeil({ platform, thumbUri, onPress }: SourceVeilProps) {
  const blur = Platform.OS === 'ios' ? 32 : 20;
  const inner = (
    <>
      {/* Opaque base, present from the first frame so the live source NEVER flashes
          through while the (network) blur image is still loading. */}
      <View style={styles.base} />
      {!!thumbUri && (
        <Image source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={blur} />
      )}
      <View style={styles.scrim} />
      <View style={styles.center}>
        <BrandButton platform={platform} />
        <Text style={styles.hint}>Tap the video to play &amp; react</Text>
      </View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={0.92} onPress={onPress}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={StyleSheet.absoluteFill} pointerEvents="none">{inner}</View>;
}

const styles = StyleSheet.create({
  base: { ...StyleSheet.absoluteFillObject, backgroundColor: '#08040E' },   // opaque — hides the source instantly
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: SPACE.MD },
  btn: { width: 78, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnShadow: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  tiktokGlow: { borderWidth: 1.5, borderColor: 'rgba(37,244,238,0.9)' },   // cyan edge nod to TikTok
  tri: {
    width: 0, height: 0, marginLeft: 5,
    borderTopWidth: 13, borderBottomWidth: 13, borderLeftWidth: 22,
    borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#FFFFFF',
  },
  hint: {
    color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
});
