import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, Animated, Pressable, Easing, useWindowDimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { C, FONT, SPACE, RADIUS } from '../../theme';
import { useFeedStore } from '../../store/feedStore';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);
const BAR_H = 58;
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

type TabBtnProps = {
  route: keyof typeof ICONS;
  label: string;
  active: boolean;
  toReact: number;
  onPress: () => void;
};

function TabBtn({ route, label, active, toReact, onPress }: TabBtnProps) {
  const color = active ? C.DANGER : C.WHITE;
  return (
    <TouchableOpacity style={styles.tab} onPress={onPress} activeOpacity={0.7}>
      <View>
        <Image source={ICONS[route]} style={[styles.icon, { tintColor: color, opacity: active ? 1 : 0.5 }]} resizeMode="contain" />
        {route === 'Feed' && toReact > 0 && (
          <View style={styles.badge}><Text style={styles.badgeText}>{toReact}</Text></View>
        )}
      </View>
      <Text style={[styles.label, { color, opacity: active ? 1 : 0.6 }]}>{label}</Text>
    </TouchableOpacity>
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
                <Image source={it.icon} style={styles.popupIcon} resizeMode="contain" />
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>
      )}

      {/* "Studio" badge — centered, just under the ＋ FAB (acts as its label) */}
      {canCreate && (
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
          <TouchableOpacity style={styles.fabSlot} activeOpacity={0.85} onPress={() => navigation.getParent()?.navigate('Studio' as never)}>
            <View style={styles.fabShadow}>
              <LinearGradient colors={['#FF4FA3', '#A05CFF', '#3B82F6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
                <Ionicons name="camera" size={28} color={C.WHITE} />
              </LinearGradient>
            </View>
          </TouchableOpacity>
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
  icon: { width: 26, height: 26 },
  label: { fontSize: 10, fontFamily: FONT.BODY_MEDIUM, marginTop: 2 },
  badge: {
    position: 'absolute', top: -5, right: -10, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.ACCENT_HOT, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: C.WHITE, fontSize: 9, fontFamily: FONT.BODY_BOLD },
  fabSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Shadow lives on a solid-background wrapper (a gradient layer can't be shadowed efficiently).
  fabShadow: {
    borderRadius: 27, marginTop: -20, backgroundColor: '#A05CFF',
    shadowColor: '#A05CFF', shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
  fab: {
    width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  fabPlus: { color: C.WHITE, fontSize: 30, lineHeight: 32, fontWeight: '300', marginTop: -2 },
  backdrop: { position: 'absolute', left: 0, right: 0, top: -1000, bottom: 0 },
  popup: { position: 'absolute', right: SPACE.LG, alignItems: 'flex-end', gap: SPACE.SM },
  popupItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    backgroundColor: C.SURFACE_2, borderRadius: RADIUS.FULL, borderWidth: 1, borderColor: C.BORDER,
    paddingVertical: SPACE.SM, paddingHorizontal: SPACE.LG,
  },
  popupLabel: { color: C.INK, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD },
  popupIcon: { width: 20, height: 20, tintColor: C.INK },
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
