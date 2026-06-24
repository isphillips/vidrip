import { log } from '../../../infrastructure/logging/logger';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, Modal,
} from 'react-native';
import Video from 'react-native-video';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolation,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '../../../infrastructure/supabase/client';
import AccountBlob from '../../../components/AccountBlob';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchPublicChannels,
  fetchMembersOnlyChannels,
  fetchSubscribedChannels,
  fetchMyChannels,
  acceptChannelInvite,
  declineChannelInvite,
  setChannelPublic,
  setChannelInviteOnly,
  type ChannelSummary,
} from '../../../infrastructure/supabase/queries/channels';
import ChannelCard from '../components/ChannelCard';
import type { RowState } from '../../../components/conversation/useRowState';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

// One unified, recency-sorted activity list for every channel the user can act on —
// curated public, members-only, subscribed, and owned. The old Public/Exclusive
// toggle and the five filter pills are gone; unread channels float up and highlight
// teal, caught-up channels grey out. Tapping a row opens the channel screen unchanged.
type ChannelFilter = 'all' | 'public' | 'invite' | 'mine';
const FILTERS: { key: ChannelFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'All channels', icon: 'apps-outline' },
  { key: 'public', label: 'Public', icon: 'globe-outline' },
  { key: 'invite', label: 'Invite only', icon: 'lock-closed-outline' },
  { key: 'mine', label: 'My channels', icon: 'person-outline' },
];

export default function ChannelsHomeScreen({
  navigation,
}: ChannelsStackScreenProps<'ChannelsHome'>) {
  const { user } = useAuthStore();
  const { top } = useSafeAreaInsets();

  const [publicChannels, setPublicChannels] = useState<ChannelSummary[]>([]);
  const [membersOnly, setMembersOnly] = useState<ChannelSummary[]>([]);
  const [subscribed, setSubscribed] = useState<ChannelSummary[]>([]);
  const [myChannels, setMyChannels] = useState<ChannelSummary[]>([]);
  const [filter, setFilter] = useState<ChannelFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Channel intro video — plays full-screen, autoplays, auto-closes on end.
  const [introUrl, setIntroUrl] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!user) { return; }
    if (!silent) { setLoading(true); }
    try {
      const [pub, mo, subd, mine] = await Promise.all([
        fetchPublicChannels(user.id).catch(() => []),
        fetchMembersOnlyChannels(user.id).catch(() => []),
        fetchSubscribedChannels(user.id).catch(() => []),
        fetchMyChannels(user.id).catch(() => []),
      ]);
      setPublicChannels(pub);
      setMembersOnly(mo);
      setSubscribed(subd);
      setMyChannels(mine);
    } catch (e) {
      log.error('[ChannelsHome] load error:', JSON.stringify(e));
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
    // Owned channels first so an owner's full metadata (incl. private/unlisted ones the public
    // sections drop) wins the dedup; the sort below is unchanged.
    for (const c of [...myChannels, ...subscribed, ...membersOnly, ...publicChannels]) {
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
  }, [publicChannels, membersOnly, subscribed, myChannels]);

  // Filter is applied AFTER the sort (no sort change): all / public / invite-only / my channels.
  const filtered = useMemo(() => {
    switch (filter) {
      case 'public': return data.filter(c => c.is_public && !c.invite_only);
      case 'invite': return data.filter(c => !!c.invite_only);
      case 'mine':   return data.filter(c => c.created_by === user?.id);
      default:       return data;
    }
  }, [data, filter, user?.id]);

  // The Filter pill hides (translated off the top, faded out) when the list is at the top, then slides
  // down next to the title as you scroll into the list — and tucks away again when you return to the top.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });
  const pillStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 24, 56], [0, 0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, 56], [-40, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Channels</Text>
        {/* Scroll-reveal filter pill: hidden (off the top, faded) at the list top; slides down next to
            the title as you scroll in, tucks away again at the top. */}
        <Reanimated.View style={[styles.headerPill, pillStyle]}>
          <TouchableOpacity style={styles.filterPill} onPress={() => setFilterOpen(true)} activeOpacity={0.85}>
            <Ionicons name="funnel-outline" size={14} color={C.INK} />
            <Text style={styles.filterPillTxt}>
              {filter === 'all' ? 'Filter' : FILTERS.find(f => f.key === filter)?.label}
            </Text>
            <Ionicons name="chevron-down" size={14} color={C.MUTED} />
          </TouchableOpacity>
        </Reanimated.View>
        <TouchableOpacity style={styles.acctBtn} hitSlop={10} activeOpacity={0.7}
          onPress={() => (navigation as any).getParent()?.navigate('Account')}>
          <AccountBlob size={34} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} /></View>
      ) : (
        <Reanimated.FlatList
          data={filtered}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyExtractor={(c: ChannelSummary) => c.id}
          renderItem={({ item }) => {
            const isOwner = item.created_by === user?.id;
            const isPendingInvite = !!item.invite_only && item.invite_status === 'pending';
            const state: RowState = item.unread_count > 0 ? 'unread' : 'caughtup';
            return (
              <ChannelCard
                channel={item}
                userId={user?.id}
                onPress={() => navigateToChannel(item)}
                onPlayIntro={setIntroUrl}
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
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                No channels yet. Browse and join a channel to see its activity here.
              </Text>
            </View>
          }
          contentContainerStyle={data.length === 0 ? styles.emptyContainer : styles.listContent}
        />
      )}

      {/* Filter sheet — slides up from the bottom. */}
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setFilterOpen(false)}>
          <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filter channels</Text>
            {FILTERS.map(f => {
              const active = filter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={styles.sheetRow}
                  activeOpacity={0.8}
                  onPress={() => { setFilter(f.key); setFilterOpen(false); }}>
                  <Ionicons name={f.icon} size={20} color={active ? C.ACCENT_HOT : C.MUTED} />
                  <Text style={[styles.sheetRowTxt, active && styles.sheetRowTxtActive]}>{f.label}</Text>
                  {active && <Ionicons name="checkmark" size={20} color={C.ACCENT_HOT} style={styles.sheetCheck} />}
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Channel intro video — full-screen, autoplays, auto-closes on end (tap anywhere to dismiss). */}
      <Modal visible={!!introUrl} transparent={false} animationType="fade" supportedOrientations={['portrait']}
        onRequestClose={() => setIntroUrl(null)}>
        <TouchableOpacity style={styles.introPlayer} activeOpacity={1} onPress={() => setIntroUrl(null)}>
          {introUrl && (
            <Video
              source={{ uri: introUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              paused={false}
              onEnd={() => setIntroUrl(null)}
            />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  introPlayer: { flex: 1, backgroundColor: '#000' },
  header: { 
    flexDirection: 'row', alignItems: 'center', 
    paddingHorizontal: SPACE.LG, marginTop: 9
  },
  acctBtn: { marginLeft: 'auto', marginTop: 9 },
  title: {
    fontSize: FONT.SIZES.XL,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.INK,
    fontWeight: FONT.WEIGHTS.BOLD,
    textTransform: 'uppercase',
    marginTop: SPACE.SM,
  },
  privateSection: { borderBottomWidth: 1, borderBottomColor: C.BORDER_STRONG },

  // The scroll-reveal pill sits next to the title; its translateY/opacity are animated (pillStyle).
  headerPill: { marginLeft: SPACE.MD },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.FULL, borderWidth: 1, borderColor: C.BORDER,
    paddingHorizontal: SPACE.MD, paddingVertical: 7,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  filterPillTxt: { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },

  // Bottom-sheet filter modal.
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.SURFACE_2, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG,
    paddingHorizontal: SPACE.LG, paddingTop: SPACE.MD, paddingBottom: SPACE.XXL,
    borderTopWidth: 1, borderColor: C.BORDER,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.BORDER, marginBottom: SPACE.MD },
  sheetTitle: { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM, marginBottom: SPACE.SM },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD, paddingVertical: SPACE.MD },
  sheetRowTxt: { color: C.INK, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.MD },
  sheetRowTxtActive: { color: C.ACCENT_HOT, fontFamily: FONT.BODY_BOLD },
  sheetCheck: { marginLeft: 'auto' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL },
  emptyContainer: { flexGrow: 1 },
  listContent: { paddingTop: SPACE.SM },
  emptyText: {
    color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY,
    textAlign: 'center', lineHeight: 22,
  },
});
