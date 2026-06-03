import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchPublicChannels,
  fetchPrivateChannels,
  type ChannelSummary,
} from '../../../infrastructure/supabase/queries/channels';
import RadioToggle from '../components/RadioToggle';
import ChannelCard from '../components/ChannelCard';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

const TABS = ['Public', 'Private'] as const;
type Tab = typeof TABS[number];

export default function ChannelsHomeScreen({
  navigation,
}: ChannelsStackScreenProps<'ChannelsHome'>) {
  const { user } = useAuthStore();
  const { top } = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('Public');
  const [publicChannels, setPublicChannels] = useState<ChannelSummary[]>([]);
  const [privateChannels, setPrivateChannels] = useState<ChannelSummary[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const privateLoadedRef = useRef(false);

  const loadPublic = useCallback(async (silent = false) => {
    if (!user) { return; }
    if (!silent) { setLoadingPublic(true); }
    try {
      setPublicChannels(await fetchPublicChannels(user.id));
    } catch (e) {
      console.error('[ChannelsHome] fetchPublicChannels error:', JSON.stringify(e));
    } finally {
      setLoadingPublic(false);
      setRefreshing(false);
    }
  }, [user]);

  const loadPrivate = useCallback(async (silent = false) => {
    if (!user) { return; }
    if (!silent) { setLoadingPrivate(true); }
    try {
      setPrivateChannels(await fetchPrivateChannels(user.id));
      privateLoadedRef.current = true;
    } catch (e) {
      console.error('[ChannelsHome] fetchPrivateChannels error:', JSON.stringify(e));
    } finally {
      setLoadingPrivate(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    loadPublic();
    if (privateLoadedRef.current) { loadPrivate(true); }
  }, [loadPublic, loadPrivate]));

  const handleTabChange = useCallback((t: string) => {
    setTab(t as Tab);
    if (t === 'Private' && !privateLoadedRef.current) {
      loadPrivate();
    }
  }, [loadPrivate]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    if (tab === 'Public') { loadPublic(true); }
    else { loadPrivate(true); }
  }, [tab, loadPublic, loadPrivate]);

  const navigateToChannel = useCallback((item: ChannelSummary) => {
    navigation.navigate('Channel', {
      channelId: item.id,
      channelName: item.name,
      isPublic: item.is_public,
      isJoined: item.is_joined,
      isOwner: item.created_by === user?.id,
    });
  }, [navigation, user?.id]);

  const channels = tab === 'Public' ? publicChannels : privateChannels;
  const loading = tab === 'Public' ? loadingPublic : loadingPrivate;

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Channels</Text>
        <RadioToggle
          options={['Public', 'Private']}
          value={tab}
          onChange={handleTabChange}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.ACCENT_HOT} />
        </View>
      ) : (
        <FlatList
          data={channels}
          keyExtractor={c => c.id}
          renderItem={({ item }) => (
            <ChannelCard
              channel={item}
              userId={user?.id}
              onPress={() => navigateToChannel(item)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={C.ACCENT_HOT}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {tab === 'Public'
                  ? 'No public channels yet'
                  : 'Share a video with a friend to start a private channel'}
              </Text>
            </View>
          }
          contentContainerStyle={channels.length === 0 && styles.emptyContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  header: {
    paddingHorizontal: SPACE.LG,
    paddingBottom: SPACE.MD,
    paddingTop: SPACE.SM,
    gap: SPACE.MD,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  title: {
    fontSize: FONT.SIZES.XXL,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.INK,
    marginTop: SPACE.SM,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL },
  emptyContainer: { flex: 1 },
  emptyText: {
    color: C.MUTED,
    fontSize: FONT.SIZES.MD,
    fontFamily: FONT.BODY,
    textAlign: 'center',
    lineHeight: 22,
  },
});
