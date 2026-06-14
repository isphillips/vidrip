import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { fetchPrivateChannels, type ChannelSummary } from '../../../infrastructure/supabase/queries/channels';
import ChannelCard from '../components/ChannelCard';

// Private chats (DMs / group chats started by sharing a video with friends). A
// root-level full-screen modal (covers the nav; back returns to where it opened).
// `navigation` is loosely typed (root modal) to allow cross-stack navigation.
export default function PrivateChatsScreen({ navigation }: { navigation: any }) {
  const { user } = useAuthStore();
  const { top, bottom } = useSafeAreaInsets();
  const [chats, setChats] = useState<ChannelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user) { return; }
    if (!silent) { setLoading(true); }
    try { setChats(await fetchPrivateChannels(user.id)); }
    catch (e) { console.error('[PrivateChats] load', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Opening a chat dismisses this modal and shows the conversation in the Channels tab.
  const open = (item: ChannelSummary) => navigation.navigate('Main', {
    screen: 'Channels',
    params: {
      screen: 'Channel',
      params: {
        channelId: item.id,
        channelName: item.name,
        isPublic: false,
        isJoined: item.is_joined,
        isOwner: item.created_by === user?.id,
        isMembersOnly: false,
        inviteOnly: !!item.invite_only,
        ownerHandle: item.owner?.handle,
      },
    },
  });

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={C.INK} />
        </TouchableOpacity>
        <Text style={styles.title}>Messages</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} /></View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={c => c.id}
          renderItem={({ item }) => (
            <ChannelCard channel={item} userId={user?.id} onPress={() => open(item)} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.ACCENT_HOT} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>Share a video with a friend to start a private chat.</Text>
            </View>
          }
          contentContainerStyle={chats.length === 0 ? styles.emptyWrap : [styles.list, { paddingBottom: bottom + SPACE.LG }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.LG, marginBottom: SPACE.SM,
  },
  title: { fontSize: FONT.SIZES.XL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK, textTransform: 'uppercase' },
  list: { paddingTop: SPACE.SM },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL },
  emptyWrap: { flexGrow: 1 },
  empty: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, textAlign: 'center', lineHeight: 22 },
});
