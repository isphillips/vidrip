import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, Animated, Pressable, useWindowDimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { C, FONT, SPACE, RADIUS } from '../../theme';
import { useFeedStore } from '../../store/feedStore';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);
const BAR_H = 58;

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

export default function MainTabBar({ state, navigation, canCreate }: BottomTabBarProps & { canCreate: boolean }) {
  const { bottom } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const toReact = useFeedStore(s => s.toReactCount);
  const current = state.routes[state.index]?.name;

  // Flowing pink→purple→blue top border (UI-thread translateX loop, seamless).
  const flow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!canCreate) { return; }
    const loop = Animated.loop(Animated.timing(flow, { toValue: 1, duration: 4000, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [flow, canCreate]);
  const borderX = flow.interpolate({ inputRange: [0, 1], outputRange: [0, -width] });

  // "More" popup (Friends + Account rise from the bottom-right).
  const [moreOpen, setMoreOpen] = useState(false);
  const more = useRef(new Animated.Value(0)).current;
  const toggleMore = (open: boolean) => {
    setMoreOpen(open);
    Animated.timing(more, { toValue: open ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  };
  const go = (route: string) => { toggleMore(false); navigation.navigate(route as never); };
  const moreActive = current === 'Friends' || current === 'Account';

  const TabBtn = ({ route, label }: { route: keyof typeof ICONS; label: string }) => {
    const active = current === route;
    const color = active ? C.DANGER : C.WHITE;
    return (
      <TouchableOpacity style={styles.tab} onPress={() => navigation.navigate(route as never)} activeOpacity={0.7}>
        <View>
          <Image source={ICONS[route]} style={[styles.icon, { tintColor: color, opacity: active ? 1 : 0.5 }]} resizeMode="contain" />
          {route === 'Feed' && toReact > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{toReact}</Text></View>
          )}
        </View>
        <Text style={[styles.label, { color, opacity: active ? 1 : 0.6 }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  // Non-studio users get the plain, flat 5-tab bar — no FAB, More, border, or badge.
  if (!canCreate) {
    return (
      <View style={[styles.bar, { height: BAR_H + bottom, paddingBottom: bottom }]}>
        <TabBtn route="Feed" label="Feed" />
        <TabBtn route="Channels" label="Channels" />
        <TabBtn route="Share" label="Browse" />
        <TabBtn route="Friends" label="Friends" />
        <TabBtn route="Account" label="Account" />
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
          <LinearGradient colors={['#FF4FA3', '#A05CFF', '#3B82F6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.studioBadge}>
            <Text style={styles.studioBadgeText}>STUDIO</Text>
          </LinearGradient>
        </View>
      )}

      {/* The bar */}
      <View style={[styles.bar, { height: BAR_H + bottom, paddingBottom: bottom }]}>
        {/* Animated gradient top border (creator-studio only) */}
        {canCreate && (
          <View style={styles.borderClip} pointerEvents="none">
            <AnimatedGradient
              colors={['#FF4FA3', '#A05CFF', '#3B82F6', '#A05CFF', '#FF4FA3']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ width: width * 2, height: 3, transform: [{ translateX: borderX }] }}
            />
          </View>
        )}

        <TabBtn {...PRIMARY[0]} />
        <TabBtn {...PRIMARY[1]} />

        {canCreate ? (
          <TouchableOpacity style={styles.fabSlot} activeOpacity={0.85} onPress={() => navigation.getParent()?.navigate('Studio' as never)}>
            <LinearGradient colors={['#FF4FA3', '#A05CFF', '#3B82F6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
              <Text style={styles.fabPlus}>＋</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : null}

        <TabBtn {...PRIMARY[2]} />

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
    backgroundColor: C.SURFACE, borderTopWidth: 1, borderTopColor: C.BORDER,
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
  fab: {
    width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    marginTop: -20, shadowColor: '#A05CFF', shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 10,
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
  studioBadgeWrap: { zIndex: 2, position: 'absolute', left: 0, right: 0, alignItems: 'center', marginBottom: -5 },
  studioBadge: { borderRadius: RADIUS.FULL },
  studioBadgeText: { color: C.WHITE, fontSize: 10, fontFamily: FONT.BODY_BOLD, letterSpacing: 1.5, paddingHorizontal: SPACE.MD, paddingVertical: 3 },
});
