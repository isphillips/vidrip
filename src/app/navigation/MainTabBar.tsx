import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Pressable, Easing, useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withSpring, Easing as ReEasing,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { C, FONT, SPACE, RADIUS } from '../../theme';
import { useFeedStore } from '../../store/feedStore';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);
const BAR_H = 58;
// Temporarily hide the STUDIO pill to preview the standalone glowing camera FAB before removing it.
const SHOW_STUDIO_PILL = false;
// Repeating pink→purple→teal→purple→pink — symmetric ends so a one-period slide loops seamlessly.
const FLOW = ['#FF4FA3', '#A05CFF', '#2DD4BF', '#A05CFF', '#FF4FA3'];

const ICONS = {
  Feed: require('../../assets/icon-feed.png'),
  Channels: require('../../assets/icon-channels.png'),
  Share: require('../../assets/icon-share.png'),
  Friends: require('../../assets/icon-friends.png'),
  Account: require('../../assets/icon-account.png'),
};

// Primary buttons shown directly in the bar (Browse = the 'Share' route).
const PRIMARY: { route: keyof typeof ICONS; label: string }[] = [
  { route: 'Feed', label: 'Feed' },
  { route: 'Channels', label: 'Channels' },
  { route: 'Share', label: 'Browse' },
];

// Each tab is the same little slime friend — uniform + muted when idle, lit up in its own neon colour
// with a "kind" topper glyph when selected. Each has its OWN body shape (proportions + corner radii) so
// the five read as distinct creatures. IDLE is the shared resting tint.
const IDLE_SLIME = '#9486AE';
const TAB_THEME: Record<keyof typeof ICONS, { glyph: string; neon: string; shape: ViewStyle }> = {
  Feed:     { glyph: 'sparkles', neon: '#FF4FA3', shape: { width: 18, height: 18, borderTopLeftRadius: 11, borderTopRightRadius: 11, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 } },     // tall + round
  Channels: { glyph: 'grid',     neon: '#A05CFF', shape: { width: 23, height: 14, borderTopLeftRadius: 8,  borderTopRightRadius: 8,  borderBottomLeftRadius: 6, borderBottomRightRadius: 6 } },     // wide + squat
  Share:    { glyph: 'compass',  neon: '#2DD4BF', shape: { width: 19, height: 18, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomLeftRadius: 9, borderBottomRightRadius: 9 } },     // round
  Friends:  { glyph: 'heart',    neon: '#e056fd', shape: { width: 21, height: 16, borderTopLeftRadius: 13, borderTopRightRadius: 7,  borderBottomLeftRadius: 9, borderBottomRightRadius: 7 } },     // lopsided
  Account:  { glyph: 'star',     neon: '#FFD86B', shape: { width: 18, height: 18, borderTopLeftRadius: 9,  borderTopRightRadius: 9,  borderBottomLeftRadius: 9, borderBottomRightRadius: 5 } },     // tilted droplet
};

// Tiny bubbles that pop off the slime when it's selected (staggered rise + fade).
const BUBBLES = [
  { x: -5, size: 4, delay: 0 },
  { x: 6, size: 5, delay: 0.12 },
  { x: -1, size: 3, delay: 0.26 },
  { x: 7, size: 3, delay: 0.42 },
];
function Bubble({ burst, x, size, delay, color }: { burst: SharedValue<number>; x: number; size: number; delay: number; color: string }) {
  const st = useAnimatedStyle(() => {
    const v = Math.min(1, Math.max(0, (burst.value - delay) / (1 - delay)));
    const op = v <= 0 || v >= 1 ? 0 : (v < 0.3 ? v / 0.3 : 1 - (v - 0.3) / 0.7);
    return {
      opacity: op * 0.85,
      transform: [{ translateX: x + Math.sin(v * 6) * 1.5 }, { translateY: -v * 16 }, { scale: 0.5 + v * 0.7 }],
    };
  });
  return <Reanimated.View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, borderColor: color }, st]} pointerEvents="none" />;
}

// A miniature slime: a uniquely-shaped blob + googly eyes + a topper glyph. Selecting it springs a
// bounce + a little hop, blinks, puffs out bubbles, and swaps the muted idle tint for the tab's neon.
function SlimeTab({ glyph, neon, shape, active }: { glyph: string; neon: string; shape: ViewStyle; active: boolean }) {
  const pop = useSharedValue(1);
  const hop = useSharedValue(0);
  const blink = useSharedValue(1);
  const live = useSharedValue(0);
  const burst = useSharedValue(0);
  useEffect(() => {
    live.value = withRepeat(withTiming(1, { duration: 1500, easing: ReEasing.inOut(ReEasing.quad) }), -1, true);
  }, [live]);
  useEffect(() => {
    if (!active) { return; }
    pop.value = withSequence(
      withTiming(1.32, { duration: 150, easing: ReEasing.out(ReEasing.quad) }),
      withSpring(1, { damping: 6, stiffness: 220, mass: 0.6 }),
    );
    hop.value = withSequence(
      withTiming(-4, { duration: 140, easing: ReEasing.out(ReEasing.quad) }),
      withSpring(0, { damping: 5, stiffness: 200, mass: 0.6 }),
    );
    blink.value = withSequence(withTiming(0.15, { duration: 70 }), withTiming(1, { duration: 110 }));
    burst.value = 0;
    burst.value = withTiming(1, { duration: 760, easing: ReEasing.out(ReEasing.quad) });
  }, [active, pop, hop, blink, burst]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hop.value }, { scale: pop.value }, { scaleY: active ? 1 + live.value * 0.05 : 1 }],
  }));
  const lidStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const color = active ? neon : IDLE_SLIME;
  const op = active ? 1 : 0.6;

  return (
    <View style={styles.slimeTab}>
      {active && (
        <View style={styles.bubbleLayer} pointerEvents="none">
          {BUBBLES.map((b, i) => <Bubble key={i} burst={burst} x={b.x} size={b.size} delay={b.delay} color={neon} />)}
        </View>
      )}
      <Ionicons name={glyph} size={10} color={color} style={[styles.sHat, { opacity: op }]} />
      <Reanimated.View style={[styles.sBodyWrap, bodyStyle, { opacity: op }]}>
        <View style={[shape, { backgroundColor: color }]}>
          <Reanimated.View style={[styles.sEye, styles.sEyeL, lidStyle]}><View style={styles.sPupil} /></Reanimated.View>
          <Reanimated.View style={[styles.sEye, styles.sEyeR, lidStyle]}><View style={styles.sPupil} /></Reanimated.View>
        </View>
      </Reanimated.View>
    </View>
  );
}

type TabBtnProps = {
  route: keyof typeof ICONS;
  label: string;
  active: boolean;
  toReact: number;
  onPress: () => void;
};

function TabBtn({ route, label, active, toReact, onPress }: TabBtnProps) {
  const theme = TAB_THEME[route];
  return (
    <TouchableOpacity style={styles.tab} onPress={onPress} activeOpacity={0.7}>
      <View>
        <SlimeTab glyph={theme.glyph} neon={theme.neon} shape={theme.shape} active={active} />
        {route === 'Feed' && toReact > 0 && (
          <View style={styles.badge}><Text style={styles.badgeText}>{toReact}</Text></View>
        )}
      </View>
      <Text style={[styles.label, { color: active ? theme.neon : C.WHITE, opacity: active ? 1 : 0.6 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// The raised camera button: a brand-gradient FAB with a continuously breathing glow, press feedback,
// and a grounding "Studio" label so it sits with the other tabs.
function GlowFab({ onPress }: { onPress: () => void }) {
  const pulse = useSharedValue(0);
  const press = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 2000, easing: ReEasing.inOut(ReEasing.quad) }), -1, true);
  }, [pulse]);

  // Outer halo blooms out + fades; inner halo holds a soft steady glow — together they "breathe".
  const haloOut = useAnimatedStyle(() => ({ opacity: 0.22 - pulse.value * 0.16, transform: [{ scale: 0.95 + pulse.value * 0.35 }] }));
  const haloIn = useAnimatedStyle(() => ({ opacity: 0.16 + pulse.value * 0.12, transform: [{ scale: 1 + pulse.value * 0.06 }] }));
  // Centered scale only (no float) so the button stays dead-center inside its glow.
  const btn = useAnimatedStyle(() => ({
    transform: [{ scale: (1 + pulse.value * 0.03) * (1 - press.value * 0.12) }],
  }));

  return (
    <View style={styles.fabSlot}>
      <View style={styles.fabRaise}>
        <Reanimated.View style={[styles.haloOut, haloOut]} pointerEvents="none" />
        <Reanimated.View style={[styles.haloIn, haloIn]} pointerEvents="none" />
        <Pressable
          onPress={onPress}
          onPressIn={() => { press.value = withTiming(1, { duration: 90 }); }}
          onPressOut={() => { press.value = withTiming(0, { duration: 180 }); }}
          hitSlop={8}>
          <Reanimated.View style={btn}>
            <View style={styles.fabShadow}>
              <LinearGradient colors={['#FF4FA3', '#A05CFF', '#3B82F6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
                <Ionicons name="camera" size={28} color={C.WHITE} style={styles.fabIcon} />
              </LinearGradient>
            </View>
          </Reanimated.View>
        </Pressable>
      </View>
      <Text style={styles.fabLabel}>Studio</Text>
    </View>
  );
}

export default function MainTabBar({ state, navigation, canCreate }: BottomTabBarProps & { canCreate: boolean }) {
  const { bottom } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const toReact = useFeedStore(s => s.toReactCount);
  const current = state.routes[state.index]?.name;

  // Emit the standard `tabPress` event (respecting preventDefault) instead of calling
  // navigate() directly — otherwise the per-tab `tabPress` listeners in MainTabs (which
  // reset each stack to its home screen) never fire and tapping a tab while deep in its
  // stack does nothing.
  const handleTabPress = (routeName: string) => {
    const route = state.routes.find(r => r.name === routeName);
    const event = navigation.emit({
      type: 'tabPress',
      target: route?.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(routeName as never);
    }
  };

  // One slow flow drives every gradient (UI-thread translateX → smooth + seamless).
  // Each gradient is 2× its element's width; sliding by one width loops with no seam.
  const [badgeSize, setBadgeSize] = useState({ w: 64, h: 20 });
  const [studioTextSize, setStudioTextSize] = useState({ w: 48, h: 13 });
  const flow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!canCreate) { return; }
    const loop = Animated.loop(
      Animated.timing(flow, { toValue: 1, duration: 7000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [flow, canCreate]);
  const borderX = flow.interpolate({ inputRange: [0, 1], outputRange: [0, -width] });
  const badgeBorderX = flow.interpolate({ inputRange: [0, 1], outputRange: [0, -badgeSize.w] });
  const studioTextX = flow.interpolate({ inputRange: [0, 1], outputRange: [0, -studioTextSize.w] });

  // "More" popup (Friends + Account rise from the bottom-right).
  const [moreOpen, setMoreOpen] = useState(false);
  const more = useRef(new Animated.Value(0)).current;
  const toggleMore = (open: boolean) => {
    setMoreOpen(open);
    Animated.timing(more, { toValue: open ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  };
  const go = (route: string) => { toggleMore(false); handleTabPress(route); };
  const moreActive = current === 'Friends' || current === 'Account';

  // Non-studio users get the plain, flat 5-tab bar — no FAB, More, border, or badge.
  if (!canCreate) {
    return (
      <View style={[styles.bar, { height: BAR_H + bottom, paddingBottom: bottom }]}>
        <TabBtn route="Feed"     label="Feed"     active={current === 'Feed'}     toReact={toReact} onPress={() => handleTabPress('Feed')} />
        <TabBtn route="Channels" label="Channels" active={current === 'Channels'} toReact={toReact} onPress={() => handleTabPress('Channels')} />
        <TabBtn route="Share"    label="Browse"   active={current === 'Share'}    toReact={toReact} onPress={() => handleTabPress('Share')} />
        <TabBtn route="Friends"  label="Friends"  active={current === 'Friends'}  toReact={toReact} onPress={() => handleTabPress('Friends')} />
        <TabBtn route="Account"  label="Account"  active={current === 'Account'}  toReact={toReact} onPress={() => handleTabPress('Account')} />
      </View>
    );
  }

  return (
    <View pointerEvents="box-none">
      {/* Backdrop to dismiss the popup */}
      {moreOpen && <Pressable style={styles.backdrop} onPress={() => toggleMore(false)} />}

      {/* "More" popup items */}
      {moreOpen && (
        <View style={[styles.popup, { bottom: BAR_H + bottom + SPACE.SM }]} pointerEvents="box-none">
          {[
            { route: 'Friends', label: 'Friends', icon: ICONS.Friends, i: 1 },
            { route: 'Account', label: 'Account', icon: ICONS.Account, i: 0 },
          ].map(it => (
            <Animated.View key={it.route} style={{
              opacity: more,
              transform: [{ translateY: more.interpolate({ inputRange: [0, 1], outputRange: [20 + it.i * 14, 0] }) }],
            }}>
              <TouchableOpacity style={styles.popupItem} onPress={() => go(it.route)} activeOpacity={0.85}>
                <Text style={styles.popupLabel}>{it.label}</Text>
                <SlimeTab
                  glyph={TAB_THEME[it.route as keyof typeof ICONS].glyph}
                  neon={TAB_THEME[it.route as keyof typeof ICONS].neon}
                  shape={TAB_THEME[it.route as keyof typeof ICONS].shape}
                  active={current === it.route}
                />
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>
      )}

      {/* "Studio" badge — centered, just under the ＋ FAB (acts as its label) */}
      {SHOW_STUDIO_PILL && canCreate && (
        <View style={[styles.studioBadgeWrap, { bottom: bottom + 4 }]} pointerEvents="none">
          <View
            style={styles.studioBadge}
            onLayout={e => {
              const { width: w, height: h } = e.nativeEvent.layout;
              setBadgeSize(s => (Math.abs(s.w - w) > 1 || Math.abs(s.h - h) > 1) ? { w, h } : s);
            }}>
            {/* Flowing gradient border (sits behind the inset solid pill). */}
            <AnimatedGradient
              colors={FLOW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{
                position: 'absolute', top: 0, left: 0,
                width: badgeSize.w * 2, height: badgeSize.h, transform: [{ translateX: badgeBorderX }],
              }}
            />
            <View style={styles.studioBadgeInner}>
              <MaskedView
                style={{ width: studioTextSize.w, height: studioTextSize.h }}
                maskElement={
                  <Text
                    style={styles.studioBadgeText}
                    onLayout={e => {
                      const { width: w, height: h } = e.nativeEvent.layout;
                      setStudioTextSize(s => (Math.abs(s.w - w) > 1 || Math.abs(s.h - h) > 1) ? { w, h } : s);
                    }}>STUDIO</Text>
                }>
                <AnimatedGradient
                  colors={FLOW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={{ width: studioTextSize.w * 2, height: studioTextSize.h, transform: [{ translateX: studioTextX }] }}
                />
              </MaskedView>
            </View>
          </View>
        </View>
      )}

      {/* The bar */}
      <View style={[styles.bar, { height: BAR_H + bottom, paddingBottom: bottom }]}>
        {/* Animated gradient top border (creator-studio only) */}
        {canCreate && (
          <View style={styles.borderClip} pointerEvents="none">
            <AnimatedGradient
              colors={FLOW}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ width: width * 2, height: 3, transform: [{ translateX: borderX }] }}
            />
          </View>
        )}

        <TabBtn route={PRIMARY[0].route} label={PRIMARY[0].label} active={current === PRIMARY[0].route} toReact={toReact} onPress={() => handleTabPress(PRIMARY[0].route)} />
        <TabBtn route={PRIMARY[1].route} label={PRIMARY[1].label} active={current === PRIMARY[1].route} toReact={toReact} onPress={() => handleTabPress(PRIMARY[1].route)} />

        {canCreate ? (
          <GlowFab onPress={() => navigation.getParent()?.navigate('Studio' as never)} />
        ) : null}

        <TabBtn route={PRIMARY[2].route} label={PRIMARY[2].label} active={current === PRIMARY[2].route} toReact={toReact} onPress={() => handleTabPress(PRIMARY[2].route)} />

        {/* More (hamburger) */}
        {(() => {
          const on = moreActive || moreOpen;
          return (
            <TouchableOpacity style={styles.tab} onPress={() => toggleMore(!moreOpen)} activeOpacity={0.7}>
              <Ionicons name="menu" size={26} color={on ? C.DANGER : C.WHITE} style={{ opacity: on ? 1 : 0.5 }} />
              <Text style={[styles.label, { color: on ? C.DANGER : C.WHITE, opacity: on ? 1 : 0.6 }]}>More</Text>
            </TouchableOpacity>
          );
        })()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.SURFACE,
  },
  borderClip: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, overflow: 'hidden' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: SPACE.SM },
  label: { fontSize: 10, fontFamily: FONT.BODY_MEDIUM, marginTop: 2 },

  // miniature slime friend
  slimeTab: { width: 28, height: 24, alignItems: 'center', justifyContent: 'flex-end' },
  sHat: { position: 'absolute', top: -3, zIndex: 2 },
  sBodyWrap: { alignItems: 'center' },
  bubbleLayer: { position: 'absolute', top: 3, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  bubble: { position: 'absolute', borderWidth: 1.2, backgroundColor: 'transparent' },
  sEye: { position: 'absolute', top: 5, width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sEyeL: { left: 4 },
  sEyeR: { right: 4 },
  sPupil: { width: 2.4, height: 2.4, borderRadius: 1.2, backgroundColor: '#16091f' },
  badge: {
    position: 'absolute', top: -5, right: -10, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.ACCENT_HOT, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: C.WHITE, fontSize: 9, fontFamily: FONT.BODY_BOLD },
  fabSlot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
  // Raised box that floats the camera button above the bar and hosts the glow halos + sparkles.
  fabRaise: { marginTop: -14, width: 74, height: 74, alignItems: 'center', justifyContent: 'center' },
  // Both fill the 74×74 raise box so they auto-center behind the 54px button; the animated scale
  // differentiates them (outer blooms wide + fades, inner holds a tighter steady glow).
  haloOut: { position: 'absolute', width: 74, height: 74, borderRadius: 37, backgroundColor: '#FF4FA3' },
  haloIn: { position: 'absolute', width: 74, height: 74, borderRadius: 37, backgroundColor: '#A05CFF' },
  // Shadow lives on a solid-background wrapper (a gradient layer can't be shadowed efficiently).
  fabShadow: {
    borderRadius: 27, backgroundColor: '#A05CFF',
    shadowColor: '#A05CFF', shadowOpacity: 0.4, shadowRadius: 11, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  fab: {
    width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)',
  },
  // The Ionicons "camera" glyph sits slightly low-right in its box — nudge it up-and-left to center.
  fabIcon: { transform: [{ translateX: -1.45 }, { translateY: -2.8 }], includeFontPadding: false },
  fabLabel: { fontSize: 10, fontFamily: FONT.BODY_MEDIUM, color: C.WHITE, opacity: 0.9, marginTop: 1 },
  fabPlus: { color: C.WHITE, fontSize: 30, lineHeight: 32, fontWeight: '300', marginTop: -2 },
  backdrop: { position: 'absolute', left: 0, right: 0, top: -1000, bottom: 0 },
  popup: { position: 'absolute', right: SPACE.LG, alignItems: 'flex-end', gap: SPACE.SM },
  popupItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    backgroundColor: C.SURFACE_2, borderRadius: RADIUS.FULL, borderWidth: 1, borderColor: C.BORDER,
    paddingVertical: SPACE.SM, paddingHorizontal: SPACE.LG,
  },
  popupLabel: { color: C.INK, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD },
  studioBadgeWrap: { zIndex: 2, position: 'absolute', left: 0, right: 0, alignItems: 'center', marginBottom: -17 },
  // Transparent + clipped so the flowing gradient shows only as a ~1.5px ring around the inset pill.
  studioBadge: { borderRadius: RADIUS.FULL, overflow: 'hidden', backgroundColor: 'transparent' },
  studioBadgeInner: {
    margin: 1.5, borderRadius: RADIUS.FULL, backgroundColor: '#190A33',
    paddingHorizontal: SPACE.MD, paddingVertical: 3,
  },
  // Mask glyphs — color is irrelevant (only alpha matters), the gradient shows through.
  studioBadgeText: { color: '#000', fontSize: 10, fontFamily: FONT.BODY_BOLD, letterSpacing: 1.5, width: 45 },
});
