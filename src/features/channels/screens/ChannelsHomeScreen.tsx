import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../../infrastructure/supabase/client';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchPublicChannels,
  fetchMembersOnlyChannels,
  fetchSubscribedChannels,
  acceptChannelInvite,
  declineChannelInvite,
  setChannelPublic,
  setChannelInviteOnly,
  type ChannelSummary,
} from '../../../infrastructure/supabase/queries/channels';
import { useShareIntentStore } from '../../../store/shareIntentStore';
import RadioToggle from '../components/RadioToggle';
import ChannelCard from '../components/ChannelCard';
import MailboxButton from '../components/MailboxButton';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

const TABS = ['Public', 'Exclusive'] as const;
type Tab = typeof TABS[number];

// Sub-filters within the Public tab.
const FILTERS = [
  { key: 'curated', label: 'Curated' },
  { key: 'open', label: 'Members (Open)' },
  { key: 'invite', label: 'Members (Invite Only)' },
  { key: 'subscribed', label: 'My Subscriptions' },
  { key: 'mine', label: 'My Channels' },
] as const;
type Filter = typeof FILTERS[number]['key'];

export default function ChannelsHomeScreen({
  navigation,
}: ChannelsStackScreenProps<'ChannelsHome'>) {
  const { user } = useAuthStore();
  const { top } = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('Public');
  const [filter, setFilter] = useState<Filter>('curated');
  const [publicChannels, setPublicChannels] = useState<ChannelSummary[]>([]);
  const [membersOnly, setMembersOnly] = useState<ChannelSummary[]>([]);
  const [subscribed, setSubscribed] = useState<ChannelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user) { return; }
    if (!silent) { setLoading(true); }
    try {
      const [pub, mo, subd] = await Promise.all([
        fetchPublicChannels(user.id).catch(() => []),
        fetchMembersOnlyChannels(user.id).catch(() => []),
        fetchSubscribedChannels(user.id).catch(() => []),
      ]);
      setPublicChannels(pub);
      setMembersOnly(mo);
      setSubscribed(subd);
    } catch (e) {
      console.error('[ChannelsHome] load error:', JSON.stringify(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    load();
    // After a fresh subscribe, land on the My Subscriptions tab (set in RootNavigator).
    const st = useShareIntentStore.getState();
    if (st.subscribedTabPending) {
      setTab('Public');
      setFilter('subscribed');
      st.setSubscribedTabPending(false);
    }
  }, [load]));

  // Realtime: auto-refresh when someone adds this user to a channel.
  useEffect(() => {
    if (!user) { return; }
    const sub = (supabase as any)
      .channel(`my-memberships-${user.id}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'group_members',
        filter: `user_id=eq.${user.id}`,
      }, () => { load(true); })
      .subscribe();
    // removeChannel (not unsubscribe) so the channel is dropped from the registry
    // and a later re-subscribe with the same name doesn't throw.
    return () => { (supabase as any).removeChannel(sub); };
  }, [user?.id, user, load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

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
      inviteOnly: !!item.invite_only,
      ownerHandle: item.owner?.handle,
    });
  }, [navigation, user?.id]);

  const handleAcceptInvite = useCallback(async (item: ChannelSummary) => {
    try { await acceptChannelInvite(item.id); } catch { /* ignore */ }
    load(true);
  }, [load]);

  const handleDeclineInvite = useCallback(async (item: ChannelSummary) => {
    try { await declineChannelInvite(item.id); } catch { /* ignore */ }
    load(true);
  }, [load]);

  // Inline owner toggles from a "My Channels" card. Optimistic, then reconcile on error.
  const patchChannel = useCallback((id: string, patch: Partial<ChannelSummary>) => {
    const upd = (arr: ChannelSummary[]) => arr.map(c => (c.id === id ? { ...c, ...patch } : c));
    setPublicChannels(upd);
    setMembersOnly(upd);
  }, []);

  const handleToggleListed = useCallback(async (item: ChannelSummary) => {
    const next = !(item.is_listed ?? item.is_public);
    patchChannel(item.id, { is_listed: next });
    try { await setChannelPublic(item.id, next); } catch { load(true); }
  }, [patchChannel, load]);

  const handleToggleInviteOnly = useCallback(async (item: ChannelSummary) => {
    const next = !item.invite_only;
    patchChannel(item.id, { invite_only: next });
    try { await setChannelInviteOnly(item.id, next); } catch { load(true); }
  }, [patchChannel, load]);

  // Public-tab sub-lists. Only listed (is_listed) channels appear in the public
  // Members sections; an owner's private/unlisted channel shows under My Channels only.
  // Channels the user actively pays for — shown only under "My Subscriptions",
  // and used to label cards "Subscribed" elsewhere.
  const subscribedIds = new Set(subscribed.map(s => s.id));
  // Subscribed rooms live under My Subscriptions only — keep them out of the
  // Members tabs so they don't duplicate (and look locked) there.
  const membersOpen = membersOnly.filter(m => m.is_listed && !m.invite_only && !subscribedIds.has(m.id));
  const membersInvite = membersOnly.filter(m => m.is_listed && m.invite_only && !subscribedIds.has(m.id));
  // "My Channels" = the public-side channels I own (created), curated + members.
  const myChannels = [...publicChannels, ...membersOnly]
    .filter(c => c.created_by === user?.id);

  const countFor = (k: Filter) =>
    k === 'mine' ? myChannels.length
    : k === 'curated' ? publicChannels.length
    : k === 'open' ? membersOpen.length
    : k === 'invite' ? membersInvite.length
    : subscribed.length;

  const publicData =
    filter === 'mine' ? myChannels
    : filter === 'curated' ? publicChannels
    : filter === 'open' ? membersOpen
    : filter === 'invite' ? membersInvite
    : subscribed;

  const data = publicData;

  const emptyText =
    filter === 'mine' ? "You don't own any channels yet"
    : filter === 'curated' ? 'No curated channels yet'
    : filter === 'open' ? 'No open Members channels yet'
    : filter === 'invite' ? 'No invite-only Members channels yet'
    : 'No subscriptions yet. Subscribe to a creator to unlock their members-only room and get exclusive posts, reactions, and reviews.';

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Channels</Text>
          <MailboxButton />
        </View>
        <View style={styles.toggleWrap}>
          <RadioToggle options={['Public', 'Exclusive']} value={tab} onChange={t => setTab(t as Tab)} />
        </View>

        {tab === 'Public' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}>
            {FILTERS.map(f => {
              const active = filter === f.key;
              const n = countFor(f.key);
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setFilter(f.key)}
                  activeOpacity={0.8}>
                  <Text style={[styles.pillTxt, active && styles.pillTxtActive]}>{f.label}</Text>
                  {n > 0 && (
                    <View style={[styles.pillCount, active && styles.pillCountActive]}>
                      <Text style={styles.pillCountTxt}>{n}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {tab === 'Exclusive' ? (
        <View style={styles.center}>
          <Ionicons name="diamond" size={40} color={C.ACCENT_HOT} style={{ marginBottom: SPACE.MD }} />
          <Text style={styles.exclusiveTitle}>Exclusive Content</Text>
          <Text style={styles.emptyText}>
            Private channels you award to your subscribers will live here. Coming soon.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.ACCENT_HOT} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={c => c.id}
          renderItem={({ item }) => (
            <ChannelCard
              channel={subscribedIds.has(item.id) ? { ...item, subscribed: true } : item}
              userId={user?.id}
              onPress={() => navigateToChannel(item)}
              {...(tab === 'Public' && filter === 'invite' ? {
                onAcceptInvite: () => handleAcceptInvite(item),
                onDeclineInvite: () => handleDeclineInvite(item),
              } : {})}
              {...(tab === 'Public' && filter === 'mine' ? {
                onToggleListed: () => handleToggleListed(item),
                onToggleInviteOnly: () => handleToggleInviteOnly(item),
              } : {})}
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
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          }
          contentContainerStyle={data.length === 0 ? styles.emptyContainer : styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  header: {
    paddingBottom: SPACE.MD,
    paddingTop: SPACE.SM,
    gap: SPACE.MD,
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.LG, marginTop: SPACE.SM,
  },
  title: {
    fontSize: FONT.SIZES.XL,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.INK,
    fontWeight: FONT.WEIGHTS.BOLD,
    textTransform: 'uppercase',
  },
  mailBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER,
  },
  exclusiveTitle: {
    fontSize: FONT.SIZES.XL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK,
    marginBottom: SPACE.SM, textTransform: 'uppercase',
  },
  toggleWrap: { paddingHorizontal: SPACE.LG },
  filterRow: { gap: SPACE.SM, paddingHorizontal: SPACE.LG, alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACE.MD, paddingVertical: 6, borderRadius: RADIUS.FULL,
    backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER,
  },
  pillActive: { borderColor: C.DANGER },
  pillTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  pillTxtActive: { color: C.DANGER },
  pillCount: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: C.ACCENT, alignItems: 'center', justifyContent: 'center',
  },
  pillCountActive: { backgroundColor: C.ACCENT_HOT },
  pillCountTxt: {
    fontSize: 11, fontFamily: FONT.BODY_BOLD, color: C.WHITE,
    textAlign: 'center', includeFontPadding: false, marginTop: -4,
  },
  listContent: { paddingTop: SPACE.SM },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL },
  emptyContainer: { flexGrow: 1 },
  emptyText: {
    color: C.MUTED,
    fontSize: FONT.SIZES.MD,
    fontFamily: FONT.BODY,
    textAlign: 'center',
    lineHeight: 22,
  },
});
