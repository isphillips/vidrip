import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../theme';
import EmojiGlyph from '../components/EmojiGlyph';

// DEMO-only reaction-watch composition for App Store screenshots: a full-screen, colorful
// urban source video (still) with the reactor in a PIP + reaction chrome. Gated by DEMO_MODE —
// WatchChannelClipScreen renders this instead of the real (file-backed) player, which has no
// content on the sim. Pure visual mock, no playback.
const SOURCE = require('./bdance.png');
const REACTOR = require('./reactor.png');
const BRAND = ['#FF4FA3', '#A05CFF', '#3B82F6'];
const EMOJIS: [string, number][] = [['🔥', 24], ['😂', 12], ['😮', 8], ['❤️', 31]];

export default function DemoReactionScreen({ onClose }: { onClose: () => void }) {
  const { top, bottom } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pipW = Math.round(width * 0.36);
  const pipH = Math.round(pipW * 1.5);

  return (
    <View style={styles.fill}>
      {/* Source video (still) — colorful urban scene */}
      <View style={styles.sourceWrap} pointerEvents="none">
        <Image source={SOURCE} style={styles.sourceImg} resizeMode="cover" />
      </View>
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={[styles.topShade, { height: top + 130 }]} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.88)']} style={styles.bottomShade} pointerEvents="none" />

      {/* Back */}
      <TouchableOpacity style={[styles.back, { top: top + SPACE.SM }]} onPress={onClose} hitSlop={8}>
        <Ionicons name="chevron-back" size={26} color={C.WHITE} />
      </TouchableOpacity>

      {/* Source title */}
      <View style={[styles.title, { top: top + SPACE.SM + 4 }]} pointerEvents="none">
        <Text style={styles.titleText} numberOfLines={1}>downtown after dark 🌃</Text>
        <Text style={styles.titleSub}>via @nova</Text>
      </View>

      {/* Reactor PIP — the person reacting */}
      <View style={[styles.pipWrap, { bottom: bottom + 124 }]}>
        <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pipBorder}>
          <Image source={REACTOR} style={{ width: pipW, height: pipH, borderRadius: RADIUS.MD }} resizeMode="cover" />
        </LinearGradient>
        <View style={styles.pipTag}>
          <View style={styles.liveDot} />
          <Text style={styles.pipTagText}>@jack</Text>
        </View>
      </View>

      {/* Emoji reactions */}
      <View style={[styles.emojiBar, { bottom: bottom + 58 }]} pointerEvents="none">
        {EMOJIS.map(([e, n]) => (
          <View key={e} style={styles.emojiPill}>
            <EmojiGlyph emoji={e} size={30} />
            <Text style={styles.emojiCount}>{n}</Text>
          </View>
        ))}
      </View>

      {/* Scrubber */}
      <View style={[styles.progress, { bottom: bottom + 40 }]} pointerEvents="none">
        <View style={styles.progressFill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  sourceWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sourceImg: { height: '100%', aspectRatio: 916 / 1717 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottomShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 320 },
  back: { position: 'absolute', left: SPACE.MD, width: 38, height: 38, borderRadius: RADIUS.FULL, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  title: { position: 'absolute', left: 64, right: 64, alignItems: 'center' },
  titleText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.DISPLAY_SEMIBOLD },
  titleSub: { color: 'rgba(255,255,255,0.7)', fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, marginTop: 1 },
  pipWrap: { position: 'absolute', right: SPACE.MD, alignItems: 'center' },
  pipBorder: { padding: 2, borderRadius: RADIUS.MD + 2 },
  pipTag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: SPACE.SM, paddingVertical: 3, borderRadius: RADIUS.FULL },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.ACCENT_HOT },
  pipTagText: { color: C.WHITE, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_SEMIBOLD },
  emojiBar: { position: 'absolute', left: SPACE.LG, flexDirection: 'row', gap: SPACE.SM },
  emojiPill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM, borderRadius: RADIUS.FULL },
  emojiCount: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD },
  progress: { position: 'absolute', left: SPACE.LG, right: SPACE.LG, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  progressFill: { width: '45%', height: '100%', borderRadius: 2, backgroundColor: C.WHITE },
});
