import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import {
  View,
  Text,
  FlatList,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchFriends,
  fetchPendingRequests,
  acceptFriendRequest,
  declineFriendRequest,
  type Friend,
  type PendingRequest,
} from '../../../infrastructure/supabase/queries/friends';
import type { FriendsStackScreenProps } from '../../../app/navigation/types';

export default function FriendsHomeScreen({ navigation }: FriendsStackScreenProps<'FriendsHome'>) {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [f, p] = await Promise.all([fetchFriends(user.id), fetchPendingRequests(user.id)]);
      setFriends(f);
      setPending(p);
    } catch {
      // degrade silently
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAccept = async (req: PendingRequest) => {
    try {
      await acceptFriendRequest(req.friendshipId);
      setPending((p) => p.filter((r) => r.friendshipId !== req.friendshipId));
      setFriends((f) => [...f, { friendshipId: req.friendshipId, userId: req.userId, handle: req.handle, displayName: req.displayName, avatarUrl: req.avatarUrl }]);
    } catch {
      Alert.alert('Error', 'Could not accept request. Try again.');
    }
  };

  const handleDecline = async (req: PendingRequest) => {
    try {
      await declineFriendRequest(req.friendshipId);
      setPending((p) => p.filter((r) => r.friendshipId !== req.friendshipId));
    } catch {
      Alert.alert('Error', 'Could not decline request. Try again.');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.headerRow, { paddingTop: top }]}>
        <Text style={styles.title}>Friends</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddFriend')}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {pending.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Requests</Text>
          {pending.map((req) => (
            <View key={req.friendshipId} style={styles.requestRow}>
              <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: req.userId })} activeOpacity={0.8}>
                {req.avatarUrl ? (
                  <Image source={{ uri: req.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{req.displayName[0]?.toUpperCase()}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.rowInfo}>
                <Text style={styles.name}>{req.displayName}</Text>
                <Text style={styles.handle}>@{req.handle}</Text>
              </View>
              <View style={styles.requestActions}>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(req)}>
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(req)}>
                  <Text style={styles.declineBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <Text style={styles.sectionLabel}>Friends</Text>
        </>
      )}

      {friends.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No friends yet</Text>
          <Text style={styles.emptyHint}>Tap + Add to find people by handle</Text>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: item.userId })} activeOpacity={0.8}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.displayName[0]?.toUpperCase()}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.handle}>@{item.handle}</Text>
              </View>
            </View>
          )}
        />
      )}

      <TouchableOpacity
        style={styles.inviteButton}
        onPress={() => navigation.navigate('InviteManagement')}>
        <Text style={styles.inviteButtonText}>Manage Invite Codes</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.BG },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 0,
    marginTop: 0,
  },
  title: {
    fontSize: FONT.SIZES.XXL,
    fontFamily: FONT.DISPLAY_BOLD,
    fontWeight: '700',
    color: C.INK,
    padding: SPACE.LG,
    marginTop: 0,
  },
  addButton: {
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.FULL,
    paddingHorizontal: SPACE.MD,
    paddingVertical: SPACE.XS,
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  addButtonText: { color: C.INK, fontSize: FONT.SIZES.SM },
  sectionLabel: {
    fontSize: FONT.SIZES.SM,
    color: C.MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginHorizontal: SPACE.LG,
    marginBottom: SPACE.SM,
    marginTop: SPACE.XS,
  },
  list: { paddingHorizontal: SPACE.LG, gap: SPACE.SM },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.MD,
    backgroundColor: C.SURFACE,
    padding: SPACE.MD,
    borderRadius: RADIUS.MD,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.MD,
    backgroundColor: C.SURFACE,
    marginHorizontal: SPACE.LG,
    marginBottom: SPACE.SM,
    padding: SPACE.MD,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.ACCENT_LITE,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.FULL,
    backgroundColor: C.ACCENT_LITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: FONT.SIZES.LG, fontWeight: '700', color: C.ACCENT },
  rowInfo: { flex: 1 },
  name: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD,
    fontWeight: '600', color: C.INK },
  handle: { fontSize: FONT.SIZES.SM, color: C.MUTED },
  requestActions: { flexDirection: 'row', gap: SPACE.SM },
  acceptBtn: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.SM,
    paddingHorizontal: SPACE.MD,
    paddingVertical: SPACE.XS,
  },
  acceptBtnText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontWeight: '600' },
  declineBtn: {
    backgroundColor: C.SURFACE_2,
    borderRadius: RADIUS.SM,
    paddingHorizontal: SPACE.MD,
    paddingVertical: SPACE.XS,
  },
  declineBtnText: { color: C.MUTED, fontSize: FONT.SIZES.SM },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.SM },
  emptyText: { fontSize: FONT.SIZES.LG, fontWeight: '600', color: C.INK },
  emptyHint: { fontSize: FONT.SIZES.SM, color: C.MUTED },
  inviteButton: {
    margin: SPACE.LG,
    padding: SPACE.MD,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
    alignItems: 'center',
  },
  inviteButtonText: { color: C.MUTED, fontSize: FONT.SIZES.SM },
});
