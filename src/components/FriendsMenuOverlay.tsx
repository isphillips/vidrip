import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../theme';
import { useFriendsMenu } from '../store/friendsMenuStore';
import { navigationRef } from '../app/navigation/navigationRef';

// Mounted once at the app root (next to ProfileDrawer). The header FriendsMenu icon calls openMenu();
// this renders the dropdown over everything as an ordinary in-tree overlay — NOT an RN <Modal>, whose
// content doesn't render on the New Architecture / Android. Navigates through the shared navigationRef
// since it lives outside any screen. Same look/animation as the old Modal-based menu.
const ITEMS: { label: string; icon: string; route: string; badged?: boolean }[] = [
  { label: 'Friend requests', icon: 'person-add-outline', route: 'FriendRequests', badged: true },
  { label: 'Friend list', icon: 'people-outline', route: 'FriendList' },
  { label: 'Add a friend', icon: 'search-outline', route: 'FindFriend' },
  { label: 'Import from contacts', icon: 'people-circle-outline', route: 'ImportContacts' },
  { label: 'New group chat', icon: 'chatbubbles-outline', route: 'CreateGroupChat' },
  { label: 'Manage invite codes', icon: 'ticket-outline', route: 'InviteCodes' },
];

export default function FriendsMenuOverlay() {
  const open = useFriendsMenu(s => s.open);
  const count = useFriendsMenu(s => s.count);
  const close = useFriendsMenu(s => s.close);
  const { top } = useSafeAreaInsets();

  const [mounted, setMounted] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      anim.setValue(0);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 220, mass: 0.7 }).start();
      return;
    }
    Animated.timing(anim, { toValue: 0, duration: 140, useNativeDriver: true })
      .start(({ finished }) => { if (finished) { setMounted(false); } });
  }, [open, anim]);

  if (!mounted) { return null; }

  const go = (route: string) => {
    close();
    if (navigationRef.isReady()) { navigationRef.navigate(route as never); }
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Transparent full-screen catcher: tap anywhere outside the card to dismiss. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={close} />

      <Animated.View style={[
        styles.card,
        { top: top + 52, opacity: anim, transform: [
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
        ] },
      ]}>
        {ITEMS.map((it, i) => (
          <React.Fragment key={it.route}>
            {i > 0 && <View style={styles.divider} />}
            <TouchableOpacity style={styles.item} activeOpacity={0.7} onPress={() => go(it.route)}>
              <Ionicons name={it.icon} size={20} color={C.ACCENT_HOT} />
              <Text style={styles.itemText}>{it.label}</Text>
              {it.badged && count > 0 && (
                <View style={styles.itemBadge}><Text style={styles.itemBadgeTxt}>{count > 99 ? '99+' : count}</Text></View>
              )}
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute', right: SPACE.LG, minWidth: 210,
    backgroundColor: C.SURFACE_2, borderRadius: RADIUS.LG, borderWidth: 1, borderColor: C.BORDER,
    paddingVertical: SPACE.SM, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  divider: { height: 1, backgroundColor: C.BORDER, marginHorizontal: SPACE.SM },
  item: { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD, paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG },
  itemText: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  itemBadge: {
    marginLeft: 'auto', minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.ACCENT_HOT,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  itemBadgeTxt: { color: C.WHITE, fontSize: 11, fontFamily: FONT.BODY_BOLD },
});
