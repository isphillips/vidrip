import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Pressable, Easing, useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withSpring, withDelay,
  interpolate, Easing as ReEasing,
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
// Studio-Home "hot" border: bright orange at the MIDPOINT (under the camera FAB) fading to red at both
// edges — a static, symmetric center-out gradient (no slide) so the colour radiates from the middle.
const FLOW_HOT = ['#FF2D55', '#FF6A00', '#FFB000', '#FF6A00', '#FF2D55'];

const NAV_ITEM_NAMES = {
  Feed: 'Feed',
  Channels: 'Channels',
  Share: 'Share',
  Messages: 'Messages',
  Friends: 'Friends',
  Account: 'Account',
};

// Each tab is the same little slime friend — uniform + muted when idle, lit up in its own neon colour
// with a "kind" topper glyph when selected. Each has its OWN body shape (proportions + corner radii) so
// the five read as distinct creatures. IDLE is the shared resting tint.
const IDLE_SLIME = '#9486AE';
const TAB_THEME: Record<keyof typeof NAV_ITEM_NAMES, { glyph: string; neon: string; shape: ViewStyle }> = {
  Feed:     { glyph: 'sparkles', neon: '#FF4FA3', shape: { width: 18, height: 18, borderTopLeftRadius: 11, borderTopRightRadius: 11, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 } },     // tall + round
  Channels: { glyph: 'grid',     neon: '#A05CFF', shape: { width: 23, height: 14, borderTopLeftRadius: 8,  borderTopRightRadius: 8,  borderBottomLeftRadius: 6, borderBottomRightRadius: 6 } },     // wide + squat
  Messages: { glyph: 'mail',     neon: '#FF6A00', shape: { width: 20, height: 17, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomLeftRadius: 7, borderBottomRightRadius: 9 } },     // neon-orange postman
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

// Each slime blinks on its own cadence so the five never blink in unison.
const BLINK_GAP: Record<keyof typeof NAV_ITEM_NAMES, number> = {
  Feed: 2600, Channels: 3400, Messages: 3600, Share: 4200, Friends: 3000, Account: 3800,
};

// A miniature slime: a uniquely-shaped blob + googly eyes + a topper glyph, plus a per-route quirk —
// Feed has little hands and nibbles a snack now and then, Channels sports TV rabbit-ear antennas, and
// Browse wears round eyeglasses. They all blink idly. Selecting one springs a bounce + hop + bubbles
// and swaps the muted idle tint for the tab's neon.
function SlimeTab({ route, glyph, neon, shape, active }: { route: keyof typeof NAV_ITEM_NAMES; glyph: string; neon: string; shape: ViewStyle; active: boolean }) {
  const pop = useSharedValue(1);
  const hop = useSharedValue(0);
  const blink = useSharedValue(1);
  const live = useSharedValue(0);
  const burst = useSharedValue(0);
  const eat = useSharedValue(0);
  const emote = useSharedValue(0);
  const wow = useSharedValue(0);
  const isFeed = route === 'Feed';
  const isFriends = route === 'Friends';
  const isAccount = route === 'Account';
  const isMessages = route === 'Messages';
  const isShare = route === 'Share';

  // gentle idle breathing
  useEffect(() => {
    live.value = withRepeat(withTiming(1, { duration: 1500, easing: ReEasing.inOut(ReEasing.quad) }), -1, true);
  }, [live]);

  // idle blink — eyes hold open, then a quick close/open, on a per-tab cadence
  useEffect(() => {
    blink.value = withRepeat(
      withSequence(
        withTiming(1, { duration: BLINK_GAP[route] }),
        withTiming(0.1, { duration: 60 }),
        withTiming(1, { duration: 90 }),
      ),
      -1,
    );
  }, [blink, route]);

  // Feed slime raises a snack to its mouth and chomps it every few seconds
  useEffect(() => {
    if (!isFeed) { return; }
    eat.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: ReEasing.out(ReEasing.quad) }), // raise + chomp
        withDelay(3000, withTiming(0, { duration: 0 })),                        // swallow, then wait
      ),
      -1,
    );
  }, [eat, isFeed]);

  // Friends blows a little heart; Account drifts sleepy z's — both rise + fade on a loop
  useEffect(() => {
    if (!isFriends && !isAccount) { return; }
    emote.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1700, easing: ReEasing.out(ReEasing.quad) }),
        withDelay(2600, withTiming(0, { duration: 0 })),
      ),
      -1,
    );
  }, [emote, isFriends, isAccount]);

  // Browse occasionally drops its jaw — "wow" at whatever it's watching.
  useEffect(() => {
    if (!isShare) { return; }
    wow.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 2600 }),                                    // mouth closed (wait)
        withTiming(1, { duration: 240, easing: ReEasing.out(ReEasing.quad) }),// jaw drops
        withTiming(1, { duration: 520 }),                                     // hold the wow
        withTiming(0, { duration: 200 }),                                     // close
      ),
      -1,
    );
  }, [wow, isShare]);

  // selecting springs a bounce + hop + bubbles (blinking stays on its idle loop)
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
    burst.value = 0;
    burst.value = withTiming(1, { duration: 760, easing: ReEasing.out(ReEasing.quad) });
  }, [active, pop, hop, burst]);

  const bodyStyle = useAnimatedStyle(() => {
    const breathe = active ? 1 + live.value * 0.05 : 1;
    // chomp: a quick squish as the snack reaches the mouth
    const v = eat.value;
    const chomp = isFeed && v > 0.45 && v < 0.8 ? 1 - Math.sin(((v - 0.45) / 0.35) * Math.PI) * 0.16 : 1;
    return { transform: [{ translateY: hop.value }, { scale: pop.value }, { scaleY: breathe * chomp }] };
  });
  const lidStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const morselStyle = useAnimatedStyle(() => {
    const v = eat.value;
    const show = v > 0.02 && v < 0.66 ? 1 : 0;
    return {
      opacity: show * (v < 0.5 ? 1 : 1 - (v - 0.5) / 0.16),
      transform: [{ translateY: interpolate(v, [0, 0.62], [4, -3]) }, { scale: v < 0.55 ? 1 : Math.max(0, 1 - (v - 0.55) / 0.11) }],
    };
  });
  const handStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: isFeed && eat.value > 0 && eat.value < 0.66 ? interpolate(eat.value, [0, 0.6], [0, -2]) : 0 }],
  }));
  const heartStyle = useAnimatedStyle(() => {
    const v = emote.value;
    const op = v <= 0 || v >= 1 ? 0 : (v < 0.18 ? v / 0.18 : 1 - (v - 0.18) / 0.82);
    return {
      opacity: op,
      transform: [
        { translateY: interpolate(v, [0, 1], [-1, -9]) },
        { translateX: interpolate(v, [0, 1], [0, 3]) },
        { scale: interpolate(v, [0, 0.3, 1], [0.3, 1, 0.85]) },
      ],
    };
  });
  const zStyleA = useAnimatedStyle(() => {
    const v = emote.value;
    const op = v <= 0 || v >= 0.85 ? 0 : (v < 0.15 ? v / 0.15 : 1 - (v - 0.15) / 0.7);
    return {
      opacity: op,
      transform: [
        { translateY: interpolate(v, [0, 0.85], [0, -9]) },
        { translateX: interpolate(v, [0, 0.85], [0, 4]) },
        { scale: interpolate(v, [0, 0.85], [0.5, 1.05]) },
      ],
    };
  });
  const zStyleB = useAnimatedStyle(() => {
    const v = emote.value;
    const w = v < 0.2 ? 0 : (v - 0.2) / 0.8;
    const op = w <= 0 || w >= 1 ? 0 : (w < 0.18 ? w / 0.18 : 1 - (w - 0.18) / 0.82);
    return {
      opacity: op,
      transform: [
        { translateY: interpolate(w, [0, 1], [0, -8]) },
        { translateX: interpolate(w, [0, 1], [0, 5]) },
        { scale: interpolate(w, [0, 1], [0.4, 0.9]) },
      ],
    };
  });
  const mouthStyle = useAnimatedStyle(() => ({
    height: interpolate(wow.value, [0, 1], [1.5, 6]),
    width: interpolate(wow.value, [0, 1], [4.5, 6]),
  }));

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
          {/* Channels: old-school TV rabbit-ear antennas (base + two long ball-tipped rods) */}
          {route === 'Channels' && (
            <>
              <View style={[styles.antBase, { backgroundColor: color }]} />
              <View style={[styles.antRod, styles.antRodL, { backgroundColor: color }]}>
                <View style={[styles.antBall, { backgroundColor: color }]} />
              </View>
              <View style={[styles.antRod, styles.antRodR, { backgroundColor: color }]}>
                <View style={[styles.antBall, { backgroundColor: color }]} />
              </View>
            </>
          )}

          {/* Messages: cross-body messenger satchel (strap + flapped bag at the hip) */}
          {isMessages && (
            <>
              <View style={styles.satchelStrap} />
              <View style={styles.satchelBag}>
                <View style={styles.satchelFlap} />
              </View>
            </>
          )}

          {/* Feed: little hands (lift a touch while eating) */}
          {isFeed && (
            <Reanimated.View style={[styles.handLayer, handStyle]} pointerEvents="none">
              <View style={[styles.hand, styles.handL, { backgroundColor: color }]} />
              <View style={[styles.hand, styles.handR, { backgroundColor: color }]} />
            </Reanimated.View>
          )}

          <Reanimated.View style={[styles.sEye, styles.sEyeL, lidStyle]}><View style={styles.sPupil} /></Reanimated.View>
          <Reanimated.View style={[styles.sEye, styles.sEyeR, lidStyle]}><View style={styles.sPupil} /></Reanimated.View>

          {/* Browse: round black-framed eyeglasses + an occasional jaw-drop "wow" mouth */}
          {route === 'Share' && (
            <>
              <View style={[styles.lens, styles.lensL]} />
              <View style={[styles.lens, styles.lensR]} />
              <View style={styles.bridge} />
              <View style={styles.sMouthLayer} pointerEvents="none">
                <Reanimated.View style={[styles.sMouth, mouthStyle]} />
              </View>
            </>
          )}

          {/* Feed: the snack it nibbles */}
          {isFeed && (
            <View style={styles.morselLayer} pointerEvents="none">
              <Reanimated.View style={[styles.morsel, morselStyle]} />
            </View>
          )}

          {/* Friends: blows a little heart */}
          {isFriends && (
            <View style={styles.emoteLayer} pointerEvents="none">
              <Reanimated.View style={heartStyle}>
                <Ionicons name="heart" size={7} color={color} />
              </Reanimated.View>
            </View>
          )}

          {/* Account: sleepy z's drifting up */}
          {isAccount && (
            <View style={styles.zLayer} pointerEvents="none">
              <Reanimated.Text style={[styles.zBig, zStyleA, { color }]}>z</Reanimated.Text>
              <Reanimated.Text style={[styles.zSmall, zStyleB, { color }]}>z</Reanimated.Text>
            </View>
          )}
        </View>
      </Reanimated.View>
    </View>
  );
}

type TabNames = {

}

type TabBtnProps = {
  route: keyof typeof NAV_ITEM_NAMES;
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
        <SlimeTab route={route} glyph={theme.glyph} neon={theme.neon} shape={theme.shape} active={active} />
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
function GlowFab({ onPress, hot = false }: { onPress: () => void; hot?: boolean }) {
  const pulse = useSharedValue(0);
  const press = useSharedValue(0);
  // On Studio Home the FAB jumps straight into a recording (a different action than "open the tab"),
  // so it glows red/orange instead of the usual pink/purple to signal that.
  const haloOutColor = hot ? '#FF3B30' : '#FF4FA3';
  const haloInColor = hot ? '#FF8A00' : '#A05CFF';
  const fabColors = hot ? ['#FFB000', '#FF6A00', '#FF2D55'] : ['#FF4FA3', '#A05CFF', '#3B82F6'];
  const glowColor = hot ? '#FF6A00' : '#A05CFF';
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
        <Reanimated.View style={[styles.haloOut, { backgroundColor: haloOutColor }, haloOut]} pointerEvents="none" />
        <Reanimated.View style={[styles.haloIn, { backgroundColor: haloInColor }, haloIn]} pointerEvents="none" />
        <Pressable
          onPress={onPress}
          onPressIn={() => { press.value = withTiming(1, { duration: 90 }); }}
          onPressOut={() => { press.value = withTiming(0, { duration: 180 }); }}
          hitSlop={8}>
          <Reanimated.View style={btn}>
            <View style={[styles.fabShadow, { backgroundColor: glowColor, shadowColor: glowColor }]}>
              <LinearGradient colors={fabColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
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

// Studio-Home "hot" top border: the orange center-out gradient GROWS from the midpoint to the edges
// (scaleX 0→1; RN scales a view around its own centre) each time you land on Studio Home.
function HotBorder({ width }: { width: number }) {
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = 0;
    grow.value = withTiming(1, { duration: 1000, easing: ReEasing.out(ReEasing.cubic) });
  }, [grow]);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleX: grow.value }] }));
  return (
    <Reanimated.View style={[{ width, height: 3 }, st]}>
      <LinearGradient colors={FLOW_HOT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width, height: 3 }} />
    </Reanimated.View>
  );
}

// Full-screen immersive screens (recorders + video players) reached inside a tab's stack.
// The bottom bar hides on these — they're nested fullScreenModals that don't cover the tab
// bar, so otherwise the bar's strip (and the purple navTheme behind it) peeks under the
// recorder/player. Same idea as Studio's deep-step hiding below.
const IMMERSIVE_ROUTES = new Set([
  'WatchYouTubePost', 'RecordReview', 'ChannelVideoRecord',
  'WatchReaction', 'WatchReview', 'WatchChannelClip', 'WatchCreatorVideo', 'ExclusiveWatch',
]);

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

  // Hide the whole bar on full-screen immersive screens reached inside a tab's stack:
  // Studio's deep creation steps (camera / trim / filter / details), and the recorder /
  // video-player screens. Those are nested fullScreenModals that never cover the tab bar,
  // so otherwise the bar's strip (and the purple navTheme behind it) shows under them.
  const activeRoute = state.routes[state.index] as any;
  const nested = activeRoute?.state;
  const sub = nested?.routes?.[nested.index ?? (nested.routes?.length ?? 1) - 1]?.name as string | undefined;
  if (activeRoute?.name === 'Studio') {
    if (sub && sub !== 'StudioHome') { return null; }
  } else if (sub && IMMERSIVE_ROUTES.has(sub)) {
    return null;
  }

  // On the Studio tab's home the FAB changes action (jump into a recording) → it + the top border go
  // "hot" (orange). On the FIRST load the nested Studio stack hasn't reported its state yet, so `sub` is
  // undefined — but the stack's initial screen IS StudioHome, so treat undefined-sub-on-Studio as home
  // (otherwise the hot state only kicked in after navigating away and back).
  const onStudioHome = current === 'Studio' && (sub === 'StudioHome' || !sub);

  // Everyone gets the Studio FAB now (the editor is open to all users). The creator-only
  // chrome — the flowing gradient top border + STUDIO pill — stays gated by `canCreate`;
  // the publish-time fork (friends vs channel) is what actually differentiates creators.
  return (
    <View pointerEvents="box-none">
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
        {/* Gradient top border. On Studio Home → static center-out orange (follows the hot FAB). Otherwise
            the creator-only flowing pink/purple/teal slide. */}
        {(onStudioHome || canCreate) && (
          <View style={styles.borderClip} pointerEvents="none">
            {onStudioHome ? (
              <HotBorder width={width} />
            ) : (
              <AnimatedGradient
                colors={FLOW}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ width: width * 2, height: 3, transform: [{ translateX: borderX }] }}
              />
            )}
          </View>
        )}

        <TabBtn route="Feed"     label="Feed"     active={current === 'Feed'}     toReact={toReact} onPress={() => handleTabPress('Feed')} />
        <TabBtn route="Channels" label="Channels" active={current === 'Channels'} toReact={toReact} onPress={() => handleTabPress('Channels')} />

        <GlowFab
          hot={onStudioHome}
          onPress={() => {
            // On the Studio tab's home screen, the FAB jumps straight into a new recording. From any
            // other tab (or screen) it behaves like a normal tab press → opens/resets Studio to its home.
            if (onStudioHome) {
              (navigation.navigate as any)('Studio', { screen: 'StudioCapture' });
            } else {
              handleTabPress('Studio');
            }
          }} />

        <TabBtn route="Messages" label="Messages" active={current === 'Messages'} toReact={toReact} onPress={() => handleTabPress('Messages')} />
        <TabBtn route="Share"    label="Browse"   active={current === 'Share'}    toReact={toReact} onPress={() => handleTabPress('Share')} />
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

  // Channels: old-school TV rabbit-ear antennas — long ball-tipped rods splaying from a base nub
  antBase: { position: 'absolute', top: -3, left: 8.5, width: 6, height: 3.5, borderRadius: 1.5 },
  antRod: { position: 'absolute', width: 1.8, height: 12, borderRadius: 1, top: -11, left: 10.6 },
  antRodL: { transformOrigin: '50% 100%', transform: [{ rotate: '-36deg' }] },
  antRodR: { transformOrigin: '50% 100%', transform: [{ rotate: '36deg' }] },
  antBall: { position: 'absolute', top: -2.5, left: -1, width: 4, height: 4, borderRadius: 2 },

  // Messages: cross-body messenger satchel — a diagonal strap + a flapped leather bag at the hip
  satchelStrap: { position: 'absolute', top: -2, left: 9, width: 2.6, height: 24, borderRadius: 1.3, backgroundColor: '#6B4423', transform: [{ rotate: '62deg' }] },
  satchelBag: { position: 'absolute', bottom: 1, left: -3, width: 10, height: 8.5, borderRadius: 2, backgroundColor: '#6B4423', overflow: 'hidden' },
  satchelFlap: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: '#4A2E18' },

  // Feed: little hands at the sides
  handLayer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  hand: { position: 'absolute', width: 5, height: 5, borderRadius: 3, bottom: 1 },
  handL: { left: -2.5 },
  handR: { right: -2.5 },
  // Feed: the snack it nibbles (rises from the bottom into the mouth)
  morselLayer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  morsel: { width: 4, height: 4, borderRadius: 1.5, backgroundColor: '#FFD86B' },

  // Browse: round black-framed eyeglasses over the eyes
  lens: { position: 'absolute', top: 3, width: 7, height: 7, borderRadius: 4, borderWidth: 1.4, borderColor: '#08040d', backgroundColor: 'transparent' },
  lensL: { left: 2 },
  lensR: { right: 2 },
  bridge: { position: 'absolute', top: 6.4, left: 8, width: 3, height: 1.4, borderRadius: 1, backgroundColor: '#08040d' },
  // Browse: jaw-drop "wow" mouth (animated open/close)
  sMouthLayer: { position: 'absolute', left: 0, right: 0, top: 11, alignItems: 'center' },
  sMouth: { backgroundColor: '#16091f', borderRadius: 3 },

  // Friends / Account: floating emote (heart / sleepy z's), rising + fading above the head
  emoteLayer: { position: 'absolute', top: -8, left: 0, right: 0, alignItems: 'center' },
  zLayer: { position: 'absolute', top: -6, right: 0, width: 14, height: 12 },
  zBig: { position: 'absolute', right: 0, bottom: 0, fontSize: 7, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
  zSmall: { position: 'absolute', right: 3, bottom: 2, fontSize: 5, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
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
  fabIcon: { marginLeft: -3, marginTop: -3, includeFontPadding: false },
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
