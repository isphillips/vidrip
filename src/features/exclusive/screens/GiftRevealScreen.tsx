import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSequence, withDelay, withSpring, Easing,
} from 'react-native-reanimated';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { fetchAward, markAwardSeen, type AwardGift } from '../../../infrastructure/exclusive/api';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

const FLOW = ['#FF4FA3', '#A05CFF', '#2DD4BF'];

export default function GiftRevealScreen({ route, navigation }: FeedStackScreenProps<'GiftReveal'>) {
  const { awardId } = route.params;
  const [gift, setGift] = useState<AwardGift | null>(null);
  const [opened, setOpened] = useState(false);

  // Box: appears, wiggles, then the lid flies off and the burst flashes.
  const boxScale = useSharedValue(0);
  const boxRot = useSharedValue(0);
  const lidY = useSharedValue(0);
  const lidOpacity = useSharedValue(1);
  const burst = useSharedValue(0);
  const reveal = useSharedValue(0); // message + CTA

  useEffect(() => {
    fetchAward(awardId).then(setGift).catch(() => {});
    markAwardSeen(awardId).catch(() => {});
  }, [awardId]);

  const pop = () => {
    if (opened) { return; }
    setOpened(true);
    lidY.value = withSequence(withTiming(-14, { duration: 120 }), withTiming(-260, { duration: 420, easing: Easing.out(Easing.cubic) }));
    lidOpacity.value = withDelay(180, withTiming(0, { duration: 360 }));
    boxRot.value = withTiming(0, { duration: 200 });
    burst.value = withSequence(withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 500 }));
    reveal.value = withDelay(360, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
  };

  useEffect(() => {
    // Entrance: spring in, then a little excited wiggle inviting the tap.
    boxScale.value = withSpring(1, { damping: 11, stiffness: 140 });
    boxRot.value = withDelay(500, withSequence(
      withTiming(-0.06, { duration: 90 }), withTiming(0.06, { duration: 90 }),
      withTiming(-0.05, { duration: 90 }), withTiming(0.04, { duration: 90 }), withTiming(0, { duration: 90 }),
    ));
  }, [boxScale, boxRot]);

  const boxStyle = useAnimatedStyle(() => ({ transform: [{ scale: boxScale.value }, { rotate: `${boxRot.value}rad` }] }));
  const lidStyle = useAnimatedStyle(() => ({ opacity: lidOpacity.value, transform: [{ translateY: lidY.value }, { rotate: `${lidY.value * 0.0008}rad` }] }));
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.value * 0.9, transform: [{ scale: 0.3 + burst.value * 3 }] }));
  const revealStyle = useAnimatedStyle(() => ({ opacity: reveal.value, transform: [{ translateY: (1 - reveal.value) * 24 }] }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: opened ? withTiming(0, { duration: 150 }) : 1 }));

  const goCollection = () => {
    if (!gift) { return; }
    navigation.replace('ExclusiveCollection', { collectionId: gift.collectionId });
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.close} hitSlop={12} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={26} color="rgba(255,255,255,0.9)" />
      </TouchableOpacity>

      {/* burst flash behind the box */}
      <Animated.View style={[styles.burst, burstStyle]} pointerEvents="none">
        <LinearGradient colors={['rgba(255,224,150,0.9)', 'rgba(255,79,163,0.4)', 'rgba(45,212,191,0)']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Pressable onPress={pop} style={styles.boxArea}>
        <Animated.View style={[styles.box, boxStyle]}>
          {/* body */}
          <LinearGradient colors={FLOW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.boxBody}>
            <View style={styles.ribbonV} />
          </LinearGradient>
          {/* lid */}
          <Animated.View style={[styles.lid, lidStyle]}>
            <LinearGradient colors={['#FFE9A8', '#FFC93C', '#E8951E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.lidTop} />
            <View style={styles.bowL} />
            <View style={styles.bowR} />
          </Animated.View>
        </Animated.View>
        <Animated.Text style={[styles.tapHint, hintStyle]}>Tap to open</Animated.Text>
      </Pressable>

      {/* reveal message + CTA */}
      <Animated.View style={[styles.reveal, revealStyle]} pointerEvents={opened ? 'auto' : 'none'}>
        <Text style={styles.giftEmoji}>🎁</Text>
        <Text style={styles.revealTitle}>You’ve been awarded exclusive content!</Text>
        {gift && (
          <Text style={styles.revealSub}>
            <Text style={styles.revealStrong}>{gift.creatorName}</Text> sent you{'\n'}
            <Text style={styles.revealStrong}>“{gift.collectionName}”</Text> in {gift.channelName}
          </Text>
        )}
        <TouchableOpacity activeOpacity={0.9} onPress={goCollection} disabled={!gift} style={{ marginTop: SPACE.LG }}>
          <LinearGradient colors={FLOW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
            <Text style={styles.ctaTxt}>View collection</Text>
            <Ionicons name="arrow-forward" size={18} color={C.WHITE} />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(8,2,16,0.94)', alignItems: 'center', justifyContent: 'center' },
  close:    { position: 'absolute', top: 56, right: 22, zIndex: 10 },
  burst:    { position: 'absolute', width: 320, height: 320, borderRadius: 160, overflow: 'hidden', top: '50%', marginTop: -240 },
  boxArea:  { alignItems: 'center', position: 'absolute', top: '50%', marginTop: -200 },
  box:      { width: 150, height: 130, alignItems: 'center' },
  boxBody:  { position: 'absolute', bottom: 0, width: 150, height: 100, borderRadius: 12, alignItems: 'center', overflow: 'hidden' },
  ribbonV:  { position: 'absolute', width: 22, height: '100%', backgroundColor: 'rgba(255,233,168,0.95)' },
  lid:      { position: 'absolute', top: 18, alignItems: 'center' },
  lidTop:   { width: 168, height: 34, borderRadius: 10 },
  bowL:     { position: 'absolute', top: -14, left: 50, width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFD24A', transform: [{ rotate: '-20deg' }] },
  bowR:     { position: 'absolute', top: -14, right: 50, width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFD24A', transform: [{ rotate: '20deg' }] },
  tapHint:  { color: 'rgba(255,255,255,0.6)', fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.SM, marginTop: SPACE.XL },

  reveal:      { alignItems: 'center', paddingHorizontal: SPACE.XL, position: 'absolute', bottom: '14%' },
  giftEmoji:   { fontSize: 40, marginBottom: SPACE.SM },
  revealTitle: { color: C.WHITE, fontFamily: FONT.DISPLAY_BOLD, fontSize: FONT.SIZES.LG, textAlign: 'center' },
  revealSub:   { color: 'rgba(255,255,255,0.85)', fontFamily: FONT.BODY, fontSize: FONT.SIZES.MD, textAlign: 'center', marginTop: SPACE.SM, lineHeight: 22 },
  revealStrong:{ color: C.ACCENT_HOT, fontFamily: FONT.BODY_BOLD },
  cta:         { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, paddingHorizontal: SPACE.XL, paddingVertical: SPACE.MD, borderRadius: RADIUS.FULL },
  ctaTxt:      { color: C.WHITE, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.MD },
});
