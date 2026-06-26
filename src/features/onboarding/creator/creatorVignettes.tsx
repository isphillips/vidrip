import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withDelay,
  Easing, interpolate, Extrapolation,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, RADIUS } from '../../../theme';
import { MiniSlime, PINK, MAGENTA, PURPLE, TEAL, GOLD } from '../../../components/scene/sceneKit';

// ════════════════════════════════════════════════════════════════════════════════════════════
//  Creator-onboarding vignettes — small theatrical "props" the slimes act out, one per scene:
//  the in-app Studio, the two-view concept (the differentiator), web tiers/dashboard, and the
//  exclusive members club. Same Views + LinearGradient + Ionicons language as the rest of the
//  slime-land; each auto-loops so it's alive whenever its scene is on screen.
// ════════════════════════════════════════════════════════════════════════════════════════════

const STAGE = 280; // common vignette width

// ── shared micro-animations ───────────────────────────────────────────────────────────────────

// A blinking record/notice dot.
function Blink({ color = '#FF3B5C', size = 9, style }: { color?: string; size?: number; style?: any }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }), -1, true); }, [t]);
  const st = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0, 1], [1, 0.2]) }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, st, style]} />;
}

// A little icon chip that bobs in place (studio tools, caption tags).
function FloatChip({ icon, label, color, delay, style }: { icon: string; label?: string; color: string; delay: number; style?: any }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true)); }, [t, delay]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(t.value, [0, 1], [3, -5]) }], opacity: 0.85 + t.value * 0.15 }));
  return (
    <Animated.View style={[styles.chip, st, style]}>
      <Ionicons name={icon} size={14} color={color} />
      {label ? <Text style={styles.chipTxt}>{label}</Text> : null}
    </Animated.View>
  );
}

// A particle (heart / sparkle / coin) that rises and fades on a loop.
function Rise({ left, bottom, icon, color, size, delay, drift = 8 }: {
  left: number; bottom: number; icon: string; color: string; size: number; delay: number; drift?: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), -1, false)); }, [t, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 0.8, 1], [0, 1, 0.7, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(t.value, [0, 1], [0, -64]) },
      { translateX: interpolate(t.value, [0, 0.5, 1], [0, drift, -drift]) },
      { scale: 0.6 + t.value * 0.6 },
    ],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', left, bottom }, st]} pointerEvents="none">
      <Ionicons name={icon} size={size} color={color} />
    </Animated.View>
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════════
//  1 · The Studio — your set
// ════════════════════════════════════════════════════════════════════════════════════════════
export function StudioVignette() {
  const sweep = useSharedValue(0);
  useEffect(() => { sweep.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, true); }, [sweep]);
  const tl = useAnimatedStyle(() => ({ opacity: interpolate(sweep.value, [0, 1], [0.4, 1]) }));

  return (
    <View style={styles.stage}>
      {/* phone / viewfinder */}
      <View style={styles.phone}>
        <LinearGradient colors={['#241038', '#160826']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        {/* rec row */}
        <View style={styles.recRow}>
          <Blink />
          <Animated.Text style={[styles.recTime, tl]}>0:14</Animated.Text>
        </View>
        {/* the talent: a slime centred in the viewfinder (left/top are relative to the 132×168 phone frame) */}
        <MiniSlime left={(132 - 62) / 2} top={(168 - 62) / 2} size={62} colors={[PINK, MAGENTA]} accessory="headset" delay={120} mouth="grin" waves />
        {/* viewfinder framing corners */}
        <View style={[styles.corner, { top: 8, left: 8, borderTopWidth: 2, borderLeftWidth: 2 }]} />
        <View style={[styles.corner, { top: 8, right: 8, borderTopWidth: 2, borderRightWidth: 2 }]} />
        <View style={[styles.corner, { bottom: 8, left: 8, borderBottomWidth: 2, borderLeftWidth: 2 }]} />
        <View style={[styles.corner, { bottom: 8, right: 8, borderBottomWidth: 2, borderRightWidth: 2 }]} />
      </View>

      {/* floating studio tools */}
      <FloatChip icon="cut" label="Trim" color={TEAL} delay={0} style={{ position: 'absolute', left: 0, top: 14 }} />
      <FloatChip icon="color-palette" label="Color" color={MAGENTA} delay={500} style={{ position: 'absolute', right: 0, top: 30 }} />
      <FloatChip icon="musical-notes" label="Music" color={GOLD} delay={900} style={{ position: 'absolute', left: 6, bottom: 30 }} />
      <FloatChip icon="sparkles" label="Lens" color={PINK} delay={1300} style={{ position: 'absolute', right: 4, bottom: 22 }} />

      {/* clapperboard */}
      <View style={styles.clapper}>
        <View style={styles.clapperTop} />
        <Ionicons name="film" size={16} color={GOLD} />
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════════
//  2 · The Two-View concept — views stay home, fans grow here
// ════════════════════════════════════════════════════════════════════════════════════════════
export function TwoViewVignette() {
  // a ticking view counter on the "socials" side
  const [views, setViews] = useState(12480);
  useEffect(() => {
    const id = setInterval(() => setViews(v => v + Math.floor(7 + Math.random() * 40)), 600);
    return () => clearInterval(id);
  }, []);

  const pulse = useSharedValue(0);
  useEffect(() => { pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true); }, [pulse]);
  const linkStyle = useAnimatedStyle(() => ({ opacity: interpolate(pulse.value, [0, 1], [0.3, 1]), transform: [{ scaleX: 0.9 + pulse.value * 0.1 }] }));

  return (
    <View style={styles.stage}>
      <View style={styles.twoRow}>
        {/* socials → views */}
        <View style={styles.panel}>
          <View style={styles.socialRow}>
            <Ionicons name="logo-youtube" size={18} color="#FF0033" />
            <Ionicons name="logo-tiktok" size={16} color="#fff" />
            <Ionicons name="logo-instagram" size={16} color="#E1306C" />
          </View>
          <View style={styles.viewPill}>
            <Ionicons name="eye" size={13} color={TEAL} />
            <Text style={styles.viewNum}>{views.toLocaleString()}</Text>
          </View>
          <Text style={styles.panelCap}>views stay home</Text>
        </View>

        {/* the link between worlds */}
        <View style={styles.linkWrap}>
          <Animated.View style={[styles.linkBar, linkStyle]} />
          <View style={styles.linkDrip}>
            <Ionicons name="water" size={18} color={MAGENTA} />
          </View>
        </View>

        {/* vidrip → fans */}
        <View style={[styles.panel, styles.panelBrand]}>
          <Text style={styles.vidripMini}>Vidrip</Text>
          <View style={[styles.viewPill, { borderColor: PINK }]}>
            <Ionicons name="people" size={13} color={PINK} />
            <Text style={[styles.viewNum, { color: PINK }]}>+ fans</Text>
          </View>
          <Text style={styles.panelCap}>fans grow here</Text>
          <Rise left={18} bottom={6} icon="heart" color={PINK} size={12} delay={0} />
          <Rise left={42} bottom={6} icon="heart" color={MAGENTA} size={10} delay={900} />
          <Rise left={60} bottom={6} icon="sparkles" color={GOLD} size={11} delay={1500} />
        </View>
      </View>

      {/* a slime bridging the two */}
      <MiniSlime left={STAGE / 2 - 24} top={108} size={48} colors={[PURPLE, '#4a2473']} accessory="crown" delay={200} mouth="grin" />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════════
//  3 · Tiers & the web dashboard — creators set up membership tiers on the web
//  (No prices shown in-app — App Store 3.1.1: the app carries no pricing/purchase surface.)
// ════════════════════════════════════════════════════════════════════════════════════════════
const TIERS = [
  { name: 'Fan', icon: 'heart', color: TEAL },
  { name: 'Super', icon: 'star', color: GOLD, hot: true },
  { name: 'Inner', icon: 'diamond', color: PINK },
];
export function TiersVignette() {
  const cursor = useSharedValue(0);
  useEffect(() => {
    cursor.value = withRepeat(withSequence(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      withDelay(500, withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.quad) })),
    ), -1, false);
  }, [cursor]);
  const curStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(cursor.value, [0, 1], [STAGE * 0.2, STAGE * 0.5]) },
      { translateY: interpolate(cursor.value, [0, 1], [70, 44]) },
    ],
  }));
  const hotStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + cursor.value * 0.06 }] }));

  return (
    <View style={styles.stage}>
      {/* browser window */}
      <View style={styles.browser}>
        <View style={styles.browserBar}>
          <View style={[styles.dot, { backgroundColor: '#FF5F57' }]} />
          <View style={[styles.dot, { backgroundColor: '#FEBC2E' }]} />
          <View style={[styles.dot, { backgroundColor: '#28C840' }]} />
          <View style={styles.url}><Ionicons name="lock-closed" size={9} color={C.MUTED} /><Text style={styles.urlTxt}>vidrip.app/dashboard</Text></View>
        </View>
        <View style={styles.tierRow}>
          {TIERS.map((t, i) => (
            <Animated.View key={t.name} style={[styles.tierCard, t.hot && styles.tierHot, t.hot && hotStyle]}>
              {t.hot && <View style={styles.tierBadge}><Text style={styles.tierBadgeTxt}>POPULAR</Text></View>}
              <Ionicons name={t.icon} size={18} color={t.color} />
              <Text style={styles.tierName}>{t.name}</Text>
              <Text style={styles.tierMo}>members</Text>
            </Animated.View>
          ))}
        </View>
      </View>
      {/* the creator's cursor, setting it up */}
      <Animated.View style={[styles.cursor, curStyle]} pointerEvents="none">
        <Ionicons name="navigate" size={18} color="#fff" style={{ transform: [{ rotate: '-12deg' }] }} />
      </Animated.View>
      {/* a slime running the dashboard */}
      <MiniSlime left={STAGE - 56} top={4} size={44} colors={[GOLD, '#E08A1E']} accessory="director" delay={200} mouth="grin" />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════════════════════
//  4 · The members club — exclusivity & loyalty
// ════════════════════════════════════════════════════════════════════════════════════════════
export function LoyaltyVignette() {
  const glow = useSharedValue(0);
  useEffect(() => { glow.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.quad) }), -1, true); }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.4 + glow.value * 0.5, transform: [{ scale: 0.92 + glow.value * 0.12 }] }));
  const lidStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(glow.value, [0, 1], [0, -3]) }, { rotateX: `${interpolate(glow.value, [0, 1], [0, 18])}deg` }] }));

  return (
    <View style={styles.stage}>
      {/* halo */}
      <Animated.View style={[styles.vaultGlow, glowStyle]} pointerEvents="none" />

      {/* treasure chest of exclusive drops */}
      <View style={styles.chest}>
        <Animated.View style={[styles.chestLid, lidStyle]}>
          <LinearGradient colors={[GOLD, '#C9821E']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <LinearGradient colors={['#5a2c12', '#3a1c0c']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.chestBox}>
          <View style={styles.lock}><Ionicons name="lock-closed" size={14} color={GOLD} /></View>
        </LinearGradient>
      </View>

      {/* rising loot */}
      <Rise left={STAGE * 0.34} bottom={70} icon="sparkles" color={GOLD} size={16} delay={0} />
      <Rise left={STAGE * 0.5} bottom={74} icon="star" color={PINK} size={14} delay={700} />
      <Rise left={STAGE * 0.62} bottom={70} icon="heart" color={MAGENTA} size={14} delay={1300} drift={-8} />
      <Rise left={STAGE * 0.44} bottom={72} icon="diamond" color={TEAL} size={12} delay={1900} />

      {/* members-only ribbon */}
      <View style={styles.ribbon}><Text style={styles.ribbonTxt}>MEMBERS ONLY</Text></View>

      {/* the loyal crew, cheering */}
      <MiniSlime left={6} top={104} size={46} colors={[PINK, MAGENTA]} accessory="party" delay={200} waves mouth="grin" sparkle />
      <MiniSlime left={STAGE - 56} top={104} size={46} colors={[TEAL, '#1f9c8c']} accessory="bow" delay={420} waves mouth="grin" />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: STAGE, height: 200, alignSelf: 'center', justifyContent: 'center' },

  // studio
  phone: {
    position: 'absolute', alignSelf: 'center', left: STAGE / 2 - 66, top: 18, width: 132, height: 168,
    borderRadius: 22, borderWidth: 2, borderColor: 'rgba(224,86,253,0.4)', overflow: 'hidden',
  },
  recRow: { position: 'absolute', top: 10, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 3 },
  recTime: { color: '#fff', fontSize: 11, fontFamily: FONT.BODY_BOLD },
  corner: { position: 'absolute', width: 16, height: 16, borderColor: 'rgba(255,255,255,0.5)' },
  clapper: { position: 'absolute', left: 8, bottom: 4, width: 34, height: 28, borderRadius: 5, backgroundColor: '#15101c', borderWidth: 1, borderColor: C.BORDER, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3 },
  clapperTop: { position: 'absolute', top: -4, left: 0, right: 0, height: 8, backgroundColor: GOLD, borderTopLeftRadius: 4, borderTopRightRadius: 4, transform: [{ rotate: '-8deg' }] },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(20,12,28,0.92)', borderWidth: 1, borderColor: C.BORDER, borderRadius: RADIUS.FULL, paddingHorizontal: 9, paddingVertical: 5 },
  chipTxt: { color: C.INK, fontSize: 11, fontFamily: FONT.BODY_SEMIBOLD },

  // two-view
  twoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  panel: { width: 104, height: 116, borderRadius: RADIUS.MD, backgroundColor: 'rgba(12,6,22,0.7)', borderWidth: 1, borderColor: C.BORDER, alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
  panelBrand: { borderColor: 'rgba(255,79,163,0.45)' },
  socialRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  viewPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(45,212,191,0.5)', borderRadius: RADIUS.FULL, paddingHorizontal: 8, paddingVertical: 4 },
  viewNum: { color: TEAL, fontSize: 11, fontFamily: FONT.BODY_BOLD },
  panelCap: { color: C.MUTED, fontSize: 9, fontFamily: FONT.BODY_SEMIBOLD, letterSpacing: 0.5, textTransform: 'uppercase' },
  vidripMini: { color: '#fff', fontSize: 15, fontFamily: FONT.DISPLAY_BOLD, letterSpacing: -0.5 },
  linkWrap: { width: 40, alignItems: 'center', justifyContent: 'center' },
  linkBar: { width: 30, height: 3, borderRadius: 2, backgroundColor: MAGENTA },
  linkDrip: { position: 'absolute' },

  // tiers
  browser: { position: 'absolute', alignSelf: 'center', left: STAGE / 2 - 130, top: 18, width: 260, borderRadius: 12, backgroundColor: 'rgba(12,6,22,0.92)', borderWidth: 1, borderColor: C.BORDER, overflow: 'hidden' },
  browserBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.05)' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  url: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: RADIUS.FULL, paddingHorizontal: 8, paddingVertical: 3 },
  urlTxt: { color: C.MUTED, fontSize: 9, fontFamily: FONT.BODY },
  tierRow: { flexDirection: 'row', gap: 8, padding: 12, justifyContent: 'center' },
  tierCard: { width: 70, borderRadius: RADIUS.MD, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: C.BORDER, alignItems: 'center', paddingVertical: 12, gap: 4 },
  tierHot: { borderColor: GOLD, backgroundColor: 'rgba(255,210,74,0.08)' },
  tierBadge: { position: 'absolute', top: -8, backgroundColor: GOLD, borderRadius: RADIUS.FULL, paddingHorizontal: 6, paddingVertical: 1 },
  tierBadgeTxt: { color: '#160826', fontSize: 7, fontFamily: FONT.BODY_BOLD, letterSpacing: 0.5 },
  tierName: { color: C.INK, fontSize: 11, fontFamily: FONT.BODY_SEMIBOLD },
  tierPrice: { fontSize: 16, fontFamily: FONT.DISPLAY_BOLD },
  tierMo: { fontSize: 9, color: C.MUTED, fontFamily: FONT.BODY },
  cursor: { position: 'absolute', left: 0, top: 0 },

  // loyalty
  vaultGlow: { position: 'absolute', alignSelf: 'center', top: 30, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,210,74,0.18)' },
  chest: { position: 'absolute', alignSelf: 'center', top: 56, width: 96, height: 76, alignItems: 'center' },
  chestLid: { width: 96, height: 30, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  chestBox: { width: 96, height: 50, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, alignItems: 'center', justifyContent: 'center' },
  lock: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#2a1606', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD },
  ribbon: { position: 'absolute', alignSelf: 'center', top: 8, backgroundColor: PINK, borderRadius: RADIUS.FULL, paddingHorizontal: 14, paddingVertical: 4 },
  ribbonTxt: { color: '#fff', fontSize: 10, fontFamily: FONT.BODY_BOLD, letterSpacing: 1.5 },
});
