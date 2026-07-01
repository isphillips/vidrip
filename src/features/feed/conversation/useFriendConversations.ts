import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../../store/authStore';
import { useBlockStore } from '../../../store/blockStore';
import { fetchFeedThreads, type FeedThread } from '../../../infrastructure/supabase/queries/threads';
import {
  fetchPrivateChannels, fetchPrivateChannelPeers, fetchGroupChatMemberAvatars, fetchLastDmPosts, leaveChannel,
  type ChannelSummary, type GroupMember, type DmLastPost,
} from '../../../infrastructure/supabase/queries/channels';
import { supabase } from '../../../infrastructure/supabase/client';
import { fetchFriends, type Friend } from '../../../infrastructure/supabase/queries/friends';
import {
  buildFriendConversations, buildGroupConversations, mergeFeedItems, type FeedItem,
} from './friendConversation';
import { DEMO_MODE } from '../../../demo/demoMode';

const HIDDEN_KEY = 'vidrip_hidden_threads';
// Conversations the user has swiped to hide (delete-for-me) — keyed `f:<friendId>` / `g:<channelId>`.
// Stored as { key: activityTsAtHide }: a hide only sticks until NEWER activity arrives, so a new message
// resurfaces the conversation. Legacy array format (just keys) migrates to ts 0 so any activity resurfaces.
const HIDDEN_CONV_KEY = 'vidrip_hidden_convs';
export const convKey = (it: FeedItem) => (it.kind === 'friend' ? `f:${it.conv.friendUserId}` : `g:${it.group.channelId}`);

function parseHiddenConvs(raw: string | null): Map<string, number> {
  if (!raw) { return new Map(); }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) { return new Map((parsed as string[]).map(k => [k, 0])); }   // legacy → resurface
    return new Map(Object.entries(parsed as Record<string, number>));
  } catch { return new Map(); }
}

// Loads the three sources (friends, feed threads, DM channels) on focus and memoizes
// the per-friend merge. Mirrors the old FeedHomeScreen load/refresh pattern.
export function useFriendConversations() {
  const { user } = useAuthStore();
  const blocked = useBlockStore(s => s.blocked);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [threads, setThreads] = useState<FeedThread[]>([]);
  const [dmChannels, setDmChannels] = useState<ChannelSummary[]>([]);
  const [peerByChannel, setPeerByChannel] = useState<Map<string, string>>(new Map());
  const [dmLastPosts, setDmLastPosts] = useState<Map<string, DmLastPost>>(new Map());
  const [groupMemberAvatars, setGroupMemberAvatars] = useState<Map<string, GroupMember[]>>(new Map());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hiddenConvs, setHiddenConvs] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadGenRef = useRef(0);
  const load = useCallback(async () => {
    if (!user) { return; }
    const gen = ++loadGenRef.current;   // newest load wins; older ones discard their results
    try {
      const [fr, th, dm, h, hc] = await Promise.all([
        fetchFriends(user.id).catch(() => null),
        fetchFeedThreads(user.id).catch(() => null),
        fetchPrivateChannels(user.id).catch(() => null),
        AsyncStorage.getItem(HIDDEN_KEY).catch(() => null),
        AsyncStorage.getItem(HIDDEN_CONV_KEY).catch(() => null),
      ]);
      // Peers map each DM channel → its friend, so they're essential before showing the list and are
      // applied together with dmChannels (a stale/empty map would unmap every DM conversation,
      // collapsing it to its share-only "reaction request" form). Resolved before any setState.
      // Peers + latest-DM-message both need the DM channel ids, so resolve them together.
      const [peers, lastPosts] = dm
        ? await Promise.all([
            fetchPrivateChannelPeers(user.id, dm.map(c => c.id)).catch(() => null),
            fetchLastDmPosts(dm.map(c => c.id)).catch(() => null),
          ])
        : [null, null];
      if (gen !== loadGenRef.current) { return; }   // a newer load superseded this one
      // Apply only what succeeded — a transient failure keeps the prior slice instead of blanking it.
      if (fr) { setFriends(fr); }
      if (th) { setThreads(th); }
      if (!DEMO_MODE && dm) { setDmChannels(dm); }
      if (peers) { setPeerByChannel(peers); }
      if (lastPosts) { setDmLastPosts(lastPosts); }
      setHidden(h ? new Set(JSON.parse(h) as string[]) : new Set());
      setHiddenConvs(parseHiddenConvs(hc));

      // Group-chat member avatars are cosmetic — load them in the BACKGROUND so the conversation list
      // shows immediately and the avatars fill in. MERGE (never replace) and don't gen-guard: avatars
      // don't depend on load order, so a superseded load — or one whose fetch transiently omits a group
      // — must not wipe an already-resolved group's avatars (that showed a revived group as the 👥
      // fallback instead of its member grid).
      const groupIds = (dm ?? []).filter(c => c.is_group_chat).map(c => c.id);
      if (groupIds.length > 0) {
        fetchGroupChatMemberAvatars(user.id, groupIds)
          .then(av => {
            if (av.size === 0) { return; }
            setGroupMemberAvatars(prev => {
              const next = new Map(prev);
              for (const [k, v] of av) { next.set(k, v); }
              return next;
            });
          })
          .catch(() => {});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live updates: while focused, reload when a reaction or DM message lands so a received reaction bumps
  // its sender's row to the top (and refreshes the preview) without a manual pull. Debounced to coalesce
  // bursts. postgres_changes is RLS-scoped, so these fire only for rows the viewer can actually see; if
  // realtime isn't wired for a table it simply no-ops and focus/pull-to-refresh still cover it.
  useFocusEffect(useCallback(() => {
    if (!user) { return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ping = () => { if (!timer) { timer = setTimeout(() => { timer = null; load(); }, 500); } };
    // Unique topic per subscription: supabase.channel() reuses a channel by name, and removeChannel is
    // async — a fixed name means a refocus (or the Feed + Messages screens both using this hook) can hand
    // back an already-subscribed channel, and adding .on() bindings to it throws.
    const sub = (supabase as any)
      .channel(`msg-live-${user.id}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, ping)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_posts' }, ping)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thread_members', filter: `user_id=eq.${user.id}` }, ping)
      .subscribe();
    return () => { if (timer) { clearTimeout(timer); } (supabase as any).removeChannel(sub); };
  }, [user, load]));

  const refresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  // Hide a conversation for this user only (persisted locally; never deletes the thread/group). We stamp
  // the conversation's CURRENT activity time, so the hide only holds until a newer message arrives — a
  // later message resurfaces the row (App-side "dismiss until something new happens").
  const hideConversation = useCallback((item: FeedItem) => {
    setHiddenConvs(prev => {
      const next = new Map(prev); next.set(convKey(item), item.sortAt);
      AsyncStorage.setItem(HIDDEN_CONV_KEY, JSON.stringify(Object.fromEntries(next))).catch(() => {});
      return next;
    });
  }, []);

  // Leave a group chat for good (removes my membership server-side, then reloads). No-op for 1:1s.
  const leaveConversation = useCallback(async (item: FeedItem) => {
    if (!user || item.kind !== 'group') { return; }
    try { await leaveChannel(item.group.channelId, user.id); } catch { /* keep the row on failure */ }
    load();
  }, [user, load]);

  const items = useMemo<FeedItem[]>(() => {
    if (!user) { return []; }
    const friendConvos = buildFriendConversations({
      friends, threads, dmChannels, peerByChannel, dmLastPosts,
      myId: user.id, blocked, hidden,
    });
    return mergeFeedItems(friendConvos, buildGroupConversations(dmChannels, groupMemberAvatars))
      // A hidden conversation stays hidden only until newer activity than when it was hidden — so a new
      // message resurfaces it (esp. group chats, whose updates would otherwise stay buried).
      .filter(it => {
        const hiddenAt = hiddenConvs.get(convKey(it));
        return hiddenAt === undefined || it.sortAt > hiddenAt;
      });
  }, [friends, threads, dmChannels, peerByChannel, dmLastPosts, groupMemberAvatars, user, blocked, hidden, hiddenConvs]);

  // Drives the bottom-tab Feed badge — count only what the Feed shows: friend reaction REQUESTS. DM
  // messages and group chats live in the Messages tab, so they don't count here.
  const toReactCount = useMemo(
    () => items.reduce((n, it) => n + (it.kind === 'friend' ? it.conv.reactionUnread : 0), 0),
    [items],
  );

  return { items, threads, toReactCount, loading, refreshing, refresh, hideConversation, leaveConversation };
}
