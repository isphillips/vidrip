import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { fetchFriends, type Friend } from '../../../infrastructure/supabase/queries/friends';
import { addMemberToChannel, fetchPrivateChannels } from '../../../infrastructure/supabase/queries/channels';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

export default function AddChannelMembersScreen({
  route, navigation,
}: ChannelsStackScreenProps<'AddChannelMembers'>) {
  const { channelId } = route.params;
  const { user } = useAuthStore();
  const { top } = useSafeAreaInsets();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { return; }
    Promise.all([
      fetchFriends(user.id),
      // get current members via group_members
      (async () => {
        const { supabase } = await import('../../../infrastructure/supabase/client');
        const { data } = await (supabase as any)
          .from('group_members').select('user_id').eq('group_id', channelId);
        return new Set<string>((data ?? []).map((m: any) => m.user_id as string));
      })(),
    ]).then(([fl, ex]) => {
      setFriends(fl);
      setExisting(ex);
    }).finally(() => setLoading(false));
  }, [user, channelId]);

  const handleAdd = useCallback(async (friend: Friend) => {
    setAdding(prev => new Set([...prev, friend.userId]));
    try {
      await addMemberToChannel(channelId, friend.userId);
      setExisting(prev => new Set([...prev, friend.userId]));
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not add member.');
    }
    setAdding(prev => { const n = new Set(prev); n.delete(friend.userId); return n; });
  }, [channelId]);

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Add People</Text>
        <View style={{ width: 52 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} /></View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={f => f.userId}
          renderItem={({ item }) => {
            const isIn = existing.has(item.userId);
            const isAdding = adding.has(item.userId);
            return (
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.displayName[0]?.toUpperCase()}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.name}>{item.displayName}</Text>
                  <Text style={styles.handle}>@{item.handle}</Text>
                </View>
                {isIn ? (
                  <Text style={styles.added}>Added</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => handleAdd(item)}
                    disabled={isAdding}
                    activeOpacity={0.8}>
                    {isAdding
                      ? <ActivityIndicator color={C.WHITE} size="small" />
                      : <Text style={styles.addBtnText}>Add</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>No friends to add</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.LG, paddingBottom: SPACE.MD,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  cancel: { color: C.ACCENT_HOT, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM, width: 52 },
  title: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL },
  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACE.LG, gap: SPACE.MD,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  avatar: {
    width: 44, height: 44, borderRadius: RADIUS.FULL,
    backgroundColor: C.ACCENT_LITE,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: FONT.SIZES.LG, fontWeight: '700', color: C.ACCENT },
  info: { flex: 1 },
  name: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  handle: { fontSize: FONT.SIZES.SM, color: C.MUTED },
  added: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.SUBTLE },
  addBtn: {
    backgroundColor: C.ACCENT, borderRadius: RADIUS.MD,
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS + 2,
    minWidth: 52, alignItems: 'center',
  },
  addBtnText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },
  empty: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
});
