import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../infrastructure/supabase/client';
import { C, FONT, SPACE } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchPublicChannels,
  fetchPrivateChannels,
  fetchMembersOnlyChannels,
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
  const [membersOnly, setMembersOnly] = useState<ChannelSummary[]>([]);
  const [privateChannels, setPrivateChannels] = useState<ChannelSummary[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const privateLoadedRef = useRef(false);

  const loadPublic = useCallback(async (silent = false) => {
    if (!user) { return; }
    if (!silent) { setLoadingPublic(true); }
    try {
      const [pub, mo] = await Promise.all([
        fetchPublicChannels(user.id),
        fetchMembersOnlyChannels(user.id).catch(() => []),
      ]);
      setPublicChannels(pub);
      setMembersOnly(mo);
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

  // Realtime: auto-show channel when someone adds this user
  useEffect(() => {
    if (!user) { return; }
    const sub = (supabase as any)
      .channel(`my-memberships-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'group_members',
        filter: `user_id=eq.${user.id}`,
      }, () => { loadPrivate(true); privateLoadedRef.current = true; })
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [user?.id, user, loadPrivate]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Members Only channels are curated creator channels — give them the same
      // public experience (video grid + react-to-reveal), not the private chat UI.
      isPublic: item.is_public || !!item.is_members_only,
      isJoined: item.is_joined,
      isOwner: item.created_by === user?.id,
      isMembersOnly: !!item.is_members_only,
      ownerHandle: item.owner?.handle,
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
          ListHeaderComponent={
            tab === 'Public' ? (
              <Text style={styles.curatedLabel}>Curated</Text>
            ) : null
          }
          ListFooterComponent={
            tab === 'Public' && membersOnly.length > 0 ? (
              <View style={styles.moSection}>
                <Text style={styles.moLabel}>Members Only</Text>
                {membersOnly.map(item => (
                  <ChannelCard
                    key={item.id}
                    channel={item}
                    userId={user?.id}
                    onPress={() => navigateToChannel(item)}
                  />
                ))}
              </View>
            ) : null
          }
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
  moSection: {},
  curatedLabel: {
    fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED,
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: SPACE.LG, paddingTop: SPACE.MD, paddingBottom: SPACE.SM,
  },
  moLabel: {
    fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED,
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: SPACE.LG, paddingTop: SPACE.XL, paddingBottom: SPACE.SM,
  },
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
