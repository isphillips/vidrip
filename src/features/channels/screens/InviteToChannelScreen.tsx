import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  searchUsersByHandle, fetchChannelInviteStates, inviteToChannel, type UserHit,
} from '../../../infrastructure/supabase/queries/channels';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

type State = 'member' | 'pending' | 'invited' | 'inviting';

export default function InviteToChannelScreen({
  route, navigation,
}: ChannelsStackScreenProps<'InviteToChannel'>) {
  const { channelId, channelName } = route.params;
  const { user } = useAuthStore();
  const { top } = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [states, setStates] = useState<Record<string, State>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Seed who's already a member / pending so they show as such.
  useEffect(() => {
    fetchChannelInviteStates(channelId)
      .then(s => setStates(prev => ({ ...s, ...prev })))
      .catch(() => {});
  }, [channelId]);

  useEffect(() => {
    if (timer.current) { clearTimeout(timer.current); }
    const q = query.trim();
    if (!q) { setHits([]); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(() => {
      searchUsersByHandle(q, user?.id)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => { if (timer.current) { clearTimeout(timer.current); } };
  }, [query, user?.id]);

  const handleInvite = useCallback(async (u: UserHit) => {
    setStates(prev => ({ ...prev, [u.id]: 'inviting' }));
    try {
      await inviteToChannel(channelId, u.id);
      setStates(prev => ({ ...prev, [u.id]: 'invited' }));
    } catch (e: any) {
      setStates(prev => { const n = { ...prev }; delete n[u.id]; return n; });
      Alert.alert('Invite', e?.message ?? 'Could not send the invite.');
    }
  }, [channelId]);

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.cancel}>Done</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>Invite to {channelName}</Text>
        <View style={{ width: 52 }} />
      </View>

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search by @handle or name"
        placeholderTextColor={C.SUBTLE}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />

      {searching ? (
        <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} /></View>
      ) : (
        <FlatList
          data={hits}
          keyExtractor={u => u.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const st = states[item.id];
            return (
              <View style={styles.row}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatar}><Text style={styles.avatarText}>{item.displayName[0]?.toUpperCase()}</Text></View>
                )}
                <View style={styles.info}>
                  <Text style={styles.name}>{item.displayName}</Text>
                  <Text style={styles.handle}>@{item.handle}</Text>
                </View>
                {st === 'member' ? (
                  <Text style={styles.muted}>Member</Text>
                ) : st === 'pending' || st === 'invited' ? (
                  <Text style={styles.muted}>Invited</Text>
                ) : st === 'inviting' ? (
                  <ActivityIndicator color={C.ACCENT_HOT} size="small" />
                ) : (
                  <TouchableOpacity style={styles.inviteBtn} onPress={() => handleInvite(item)} activeOpacity={0.8}>
                    <Text style={styles.inviteText}>Invite</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            query.trim() ? (
              <View style={styles.center}><Text style={styles.empty}>No users found</Text></View>
            ) : (
              <View style={styles.center}><Text style={styles.empty}>Search for people to invite</Text></View>
            )
          }
          contentContainerStyle={hits.length === 0 ? styles.fill : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  fill: { flexGrow: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.LG, paddingBottom: SPACE.MD,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  cancel: { color: C.ACCENT_HOT, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM, width: 52 },
  title: { flex: 1, textAlign: 'center', fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK },
  search: {
    margin: SPACE.LG, paddingHorizontal: SPACE.MD, height: 44,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD,
    borderWidth: 1, borderColor: C.BORDER, color: C.INK, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL },
  empty: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  avatar: {
    width: 44, height: 44, borderRadius: RADIUS.FULL,
    backgroundColor: C.ACCENT_LITE, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.ACCENT },
  info: { flex: 1 },
  name: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  handle: { fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY },
  muted: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.SUBTLE },
  inviteBtn: {
    backgroundColor: C.ACCENT, borderRadius: RADIUS.MD,
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS + 2, minWidth: 64, alignItems: 'center',
  },
  inviteText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },
});
