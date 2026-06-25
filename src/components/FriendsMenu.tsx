import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../theme';
import { useAuthStore } from '../store/authStore';
import { fetchPendingRequests } from '../infrastructure/supabase/queries/friends';
import SlimeFriendsIcon from './SlimeFriendsIcon';

// The shared Friends header button — a tappable Drippy-friends blob (with a count bubble for pending
// requests) that opens a context menu: Friend requests (first, badged), Add a friend, Import from
// contacts, New group chat. Drop it next to the AccountBlob in any tab header; it resolves the tab
// navigator via getParent() so it works from any tab.
export default function FriendsMenu({ size = 30 }: { size?: number }) {
  const navigation = useNavigation<any>();
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  // Refresh the pending-request count whenever a hosting screen regains focus.
  useFocusEffect(useCallback(() => {
    if (!user) { return; }
    let active = true;
    fetchPendingRequests(user.id).then(r => { if (active) { setCount(r.length); } }).catch(() => {});
    return () => { active = false; };
  }, [user]));

  const openMenu = () => {
    setOpen(true);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 220, mass: 0.7 }).start();
  };
  const closeMenu = () => {
    Animated.timing(anim, { toValue: 0, duration: 140, useNativeDriver: true })
      .start(({ finished }) => { if (finished) { setOpen(false); } });
  };
  // The tab navigator (parent of this screen's stack) — lets friend actions reach the Friends/Messages tabs.
  const tab = () => navigation.getParent?.() ?? navigation;
  const go = (run: () => void) => { closeMenu(); run(); };

  return (
    <>
      <TouchableOpacity hitSlop={8} activeOpacity={0.7} onPress={openMenu}>
        <SlimeFriendsIcon size={size} active={open} />
        {count > 0 && (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeTxt}>{count > 9 ? '9+' : count}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="none" onRequestClose={closeMenu}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeMenu}>
          <Animated.View style={[
            styles.card,
            { top: top + 52 },
            { opacity: anim, transform: [
              { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
              { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
            ] },
          ]}>
            <TouchableOpacity style={styles.item} activeOpacity={0.7}
              onPress={() => go(() => navigation.navigate('FriendRequests'))}>
              <Ionicons name="person-add-outline" size={20} color={C.ACCENT_HOT} />
              <Text style={styles.itemText}>Friend requests</Text>
              {count > 0 && (
                <View style={styles.itemBadge}><Text style={styles.itemBadgeTxt}>{count > 99 ? '99+' : count}</Text></View>
              )}
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.item} activeOpacity={0.7}
              onPress={() => go(() => tab().navigate('Friends', { screen: 'AddFriend', initial: false }))}>
              <Ionicons name="search-outline" size={20} color={C.ACCENT_HOT} />
              <Text style={styles.itemText}>Add a friend</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.item} activeOpacity={0.7}
              onPress={() => go(() => tab().navigate('Friends', { screen: 'InviteContacts', initial: false }))}>
              <Ionicons name="people-circle-outline" size={20} color={C.ACCENT_HOT} />
              <Text style={styles.itemText}>Import from contacts</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.item} activeOpacity={0.7}
              onPress={() => go(() => tab().navigate('Messages', { screen: 'CreateGroupChat', initial: false }))}>
              <Ionicons name="chatbubbles-outline" size={20} color={C.ACCENT_HOT} />
              <Text style={styles.itemText}>New group chat</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.ACCENT_HOT, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: C.BG === 'transparent' ? '#0E0716' : C.BG,
  },
  badgeTxt: { color: C.WHITE, fontSize: 9, fontFamily: FONT.BODY_BOLD },
  backdrop: { flex: 1 },
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
