import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../../store/authStore';
import { useBlockStore } from '../../../store/blockStore';
import { fetchFeedThreads, type FeedThread } from '../../../infrastructure/supabase/queries/threads';
import {
  fetchPrivateChannels, fetchPrivateChannelPeers, type ChannelSummary,
} from '../../../infrastructure/supabase/queries/channels';
import { fetchFriends, type Friend } from '../../../infrastructure/supabase/queries/friends';
import {
  buildFriendConversations, buildGroupConversations, mergeFeedItems, type FeedItem,
} from './friendConversation';
import { DEMO_MODE } from '../../../demo/demoMode';

const HIDDEN_KEY = 'vidrip_hidden_threads';
// Conversations the user has swiped to hide (delete-for-me) — keyed `f:<friendId>` / `g:<channelId>`.
const HIDDEN_CONV_KEY = 'vidrip_hidden_convs';
export const convKey = (it: FeedItem) => (it.kind === 'friend' ? `f:${it.conv.friendUserId}` : `g:${it.group.channelId}`);

// Loads the three sources (friends, feed threads, DM channels) on focus and memoizes
// the per-friend merge. Mirrors the old FeedHomeScreen load/refresh pattern.
export function useFriendConversations() {
  const { user } = useAuthStore();
  const blocked = useBlockStore(s => s.blocked);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [threads, setThreads] = useState<FeedThread[]>([]);
  const [dmChannels, setDmChannels] = useState<ChannelSummary[]>([]);
  const [peerByChannel, setPeerByChannel] = useState<Map<string, string>>(new Map());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hiddenConvs, setHiddenConvs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) { return; }
    try {
      const [fr, th, dm, h, hc] = await Promise.all([
        fetchFriends(user.id),
        fetchFeedThreads(user.id),
        fetchPrivateChannels(user.id),
        AsyncStorage.getItem(HIDDEN_KEY),
        AsyncStorage.getItem(HIDDEN_CONV_KEY),
      ]);
      setFriends(fr);
      setThreads(th);
      if (!DEMO_MODE) {
        setDmChannels(dm);
      }
      setHidden(h ? new Set(JSON.parse(h) as string[]) : new Set());
      setHiddenConvs(hc ? new Set(JSON.parse(hc) as string[]) : new Set());
      setPeerByChannel(await fetchPrivateChannelPeers(user.id, dm.map(c => c.id)));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  // Hide a conversation for this user only (persisted locally; never deletes the thread/group).
  const hideConversation = useCallback((key: string) => {
    setHiddenConvs(prev => {
      const next = new Set(prev); next.add(key);
      AsyncStorage.setItem(HIDDEN_CONV_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const items = useMemo<FeedItem[]>(() => {
    if (!user) { return []; }
    const friendConvos = buildFriendConversations({
      friends, threads, dmChannels, peerByChannel,
      myId: user.id, blocked, hidden,
    });
    return mergeFeedItems(friendConvos, buildGroupConversations(dmChannels))
      .filter(it => !hiddenConvs.has(convKey(it)));
  }, [friends, threads, dmChannels, peerByChannel, user, blocked, hidden, hiddenConvs]);

  // Total items still needing my attention — drives the bottom-tab Feed badge.
  const toReactCount = useMemo(
    () => items.reduce((n, it) => n + (it.kind === 'friend' ? it.conv.unreadCount : it.group.unreadCount), 0),
    [items],
  );

  return { items, threads, toReactCount, loading, refreshing, refresh, hideConversation };
}
