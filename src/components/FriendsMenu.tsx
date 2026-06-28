import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, FONT } from '../theme';
import { useAuthStore } from '../store/authStore';
import { fetchPendingRequests } from '../infrastructure/supabase/queries/friends';
import { useFriendsMenu } from '../store/friendsMenuStore';
import SlimeFriendsIcon from './SlimeFriendsIcon';

// The shared Friends header button — a tappable Drippy-friends blob (with a count bubble for pending
// requests). Tapping opens the shared FriendsMenuOverlay, which is mounted once at the app root (see
// RootNavigator) and renders the menu WITHOUT an RN <Modal>. Drop this next to the AccountBlob in any
// tab header; the overlay navigates via the shared navigationRef so it works from every tab.
export default function FriendsMenu({ size = 30 }: { size?: number }) {
  const { user } = useAuthStore();
  const open = useFriendsMenu(s => s.open);
  const openMenu = useFriendsMenu(s => s.openMenu);
  const count = useFriendsMenu(s => s.count);
  const setCount = useFriendsMenu(s => s.setCount);

  // Refresh the pending-request count whenever a hosting screen regains focus.
  useFocusEffect(useCallback(() => {
    if (!user) { return; }
    let active = true;
    fetchPendingRequests(user.id).then(r => { if (active) { setCount(r.length); } }).catch(() => {});
    return () => { active = false; };
  }, [user, setCount]));

  return (
    <TouchableOpacity hitSlop={8} activeOpacity={0.7} onPress={openMenu}>
      <SlimeFriendsIcon size={size} active={open} />
      {count > 0 && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeTxt}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: C.ACCENT_HOT, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: C.BG === 'transparent' ? '#0E0716' : C.BG,
  },
  badgeTxt: { color: C.WHITE, fontSize: 9, fontFamily: FONT.BODY_BOLD },
});
