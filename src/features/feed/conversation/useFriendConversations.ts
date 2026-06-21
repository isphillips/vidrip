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
import { buildFriendConversations, type FriendConversation } from './friendConversation';

const HIDDEN_KEY = 'vidrip_hidden_threads';

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) { return; }
    try {
      const [fr, th, dm, h] = await Promise.all([
        fetchFriends(user.id),
        fetchFeedThreads(user.id),
        fetchPrivateChannels(user.id),
        AsyncStorage.getItem(HIDDEN_KEY),
      ]);
      setFriends(fr);
      setThreads(th);
      setDmChannels(dm);
      setHidden(h ? new Set(JSON.parse(h) as string[]) : new Set());
      setPeerByChannel(await fetchPrivateChannelPeers(user.id, dm.map(c => c.id)));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const conversations = useMemo<FriendConversation[]>(() => {
    if (!user) { return []; }
    return buildFriendConversations({
      friends, threads, dmChannels, peerByChannel,
      myId: user.id, blocked, hidden,
    });
  }, [friends, threads, dmChannels, peerByChannel, user, blocked, hidden]);

  // Total threads still needing my reaction — drives the bottom-tab Feed badge.
  const toReactCount = useMemo(
    () => conversations.reduce((n, c) => n + c.unreadCount, 0),
    [conversations],
  );

  return { conversations, toReactCount, loading, refreshing, refresh };
}
