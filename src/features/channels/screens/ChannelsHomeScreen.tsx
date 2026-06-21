import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../infrastructure/supabase/client';
import { C, FONT, SPACE } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchPublicChannels,
  fetchMembersOnlyChannels,
  fetchSubscribedChannels,
  fetchPrivateChannels,
  acceptChannelInvite,
  declineChannelInvite,
  setChannelPublic,
  setChannelInviteOnly,
  type ChannelSummary,
} from '../../../infrastructure/supabase/queries/channels';
import ChannelCard from '../components/ChannelCard';
import ConversationRow from '../../../components/conversation/ConversationRow';
import type { RowState } from '../../../components/conversation/useRowState';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

// A private channel as shown in the Channels list — a multi-member private channel that
// is NOT a group chat (group chats live in the Feed) and NOT a 1:1 DM (those are friend
// conversations in the Feed).
type PrivateChannelRow = {
  id: string; name: string; memberCount: number; unread: number; state: RowState; lastAt: number;
};
const privateChannelRows = (channels: ChannelSummary[]): PrivateChannelRow[] =>
  channels
    .filter(c => c.is_group_chat !== true && c.member_count >= 3)
    .map(c => ({
      id: c.id,
      name: c.name || 'Private channel',
      memberCount: c.member_count,
      unread: c.unread_count,
      state: (c.unread_count > 0 ? 'unread' : 'caughtup') as RowState,
      lastAt: c.last_message_at ? Date.parse(c.last_message_at) || 0 : 0,
    }))
    .sort((a, b) => b.lastAt - a.lastAt);

// One unified, recency-sorted activity list for every channel the user can act on —
// curated public, members-only, subscribed, and owned. The old Public/Exclusive
// toggle and the five filter pills are gone; unread channels float up and highlight
// teal, caught-up channels grey out. Tapping a row opens the channel screen unchanged.
export default function ChannelsHomeScreen({
  navigation,
}: ChannelsStackScreenProps<'ChannelsHome'>) {
  const { user } = useAuthStore();
  const { top } = useSafeAreaInsets();

  const [publicChannels, setPublicChannels] = useState<ChannelSummary[]>([]);
  const [membersOnly, setMembersOnly] = useState<ChannelSummary[]>([]);
  const [subscribed, setSubscribed] = useState<ChannelSummary[]>([]);
  const [privateChannels, setPrivateChannels] = useState<PrivateChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!user) { return; }
    if (!silent) { setLoading(true); }
    try {
      const [pub, mo, subd, dm] = await Promise.all([
        fetchPublicChannels(user.id).catch(() => []),
        fetchMembersOnlyChannels(user.id).catch(() => []),
        fetchSubscribedChannels(user.id).catch(() => []),
        fetchPrivateChannels(user.id).catch(() => []),
      ]);
      setPublicChannels(pub);
      setMembersOnly(mo);
      setSubscribed(subd);
      setPrivateChannels(privateChannelRows(dm));
    } catch (e) {
      console.error('[ChannelsHome] load error:', JSON.stringify(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
    return () => { (supabase as any).removeChannel(sub); };
  }, [user?.id, user, load]);

  const handleRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

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

  // Inline owner toggles — optimistic, reconcile on error.
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

  // Merge every source into one deduped list, mark subscribed, sort unread-first then
  // by most-recent activity (fallback member count).
  const data = useMemo(() => {
    const subscribedIds = new Set(subscribed.map(s => s.id));
    const byId = new Map<string, ChannelSummary>();
    for (const c of [...subscribed, ...membersOnly, ...publicChannels]) {
      if (!byId.has(c.id)) {
        byId.set(c.id, subscribedIds.has(c.id) ? { ...c, subscribed: true } : c);
      }
    }
    return [...byId.values()].sort((a, b) => {
      const au = a.unread_count > 0 ? 0 : 1;
      const bu = b.unread_count > 0 ? 0 : 1;
      if (au !== bu) { return au - bu; }
      const at = a.last_message_at ?? '';
      const bt = b.last_message_at ?? '';
      if (at !== bt) { return bt.localeCompare(at); }
      return b.member_count - a.member_count;
    });
  }, [publicChannels, membersOnly, subscribed]);

  const privateHeader = privateChannels.length > 0 ? (
    <View style={styles.privateSection}>
      {privateChannels.map(p => (
        <ConversationRow
          key={p.id}
          avatarUrl={null}
          fallbackInitial="🔒"
          title={p.name}
          subtitle={p.unread > 0 ? `${p.unread} new` : 'Caught up'}
          unreadCount={p.unread}
          state={p.state}
          onPress={() => navigation.navigate('Channel', {
            channelId: p.id,
            channelName: p.name,
            isPublic: false,
            isJoined: true,
            isOwner: false,
            isMembersOnly: false,
          })}
        />
      ))}
    </View>
  ) : null;

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Channels</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} /></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={c => c.id}
          ListHeaderComponent={privateHeader}
          renderItem={({ item }) => {
            const isOwner = item.created_by === user?.id;
            const isPendingInvite = !!item.invite_only && item.invite_status === 'pending';
            const state: RowState = item.unread_count > 0 ? 'unread' : 'caughtup';
            return (
              <ChannelCard
                channel={item}
                userId={user?.id}
                onPress={() => navigateToChannel(item)}
                state={state}
                {...(isPendingInvite ? {
                  onAcceptInvite: () => handleAcceptInvite(item),
                  onDeclineInvite: () => handleDeclineInvite(item),
                } : {})}
                {...(isOwner ? {
                  onToggleListed: () => handleToggleListed(item),
                  onToggleInviteOnly: () => handleToggleInviteOnly(item),
                } : {})}
              />
            );
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.ACCENT_HOT} />
          }
          ListEmptyComponent={
            privateChannels.length > 0 ? null : (
              <View style={styles.center}>
                <Text style={styles.emptyText}>
                  No channels yet. Browse and join a channel to see its activity here.
                </Text>
              </View>
            )
          }
          contentContainerStyle={data.length === 0 && privateChannels.length === 0 ? styles.emptyContainer : styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  header: { paddingTop: SPACE.SM, paddingBottom: SPACE.MD, paddingHorizontal: SPACE.LG },
  title: {
    fontSize: FONT.SIZES.XL,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.INK,
    fontWeight: FONT.WEIGHTS.BOLD,
    textTransform: 'uppercase',
    marginTop: SPACE.SM,
  },
  privateSection: { borderBottomWidth: 1, borderBottomColor: C.BORDER_STRONG },
  listContent: { paddingTop: SPACE.SM },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL },
  emptyContainer: { flexGrow: 1 },
  emptyText: {
    color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY,
    textAlign: 'center', lineHeight: 22,
  },
});
