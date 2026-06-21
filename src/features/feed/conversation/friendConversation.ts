import type { FeedThread } from '../../../infrastructure/supabase/queries/threads';
import type { ChannelSummary } from '../../../infrastructure/supabase/queries/channels';
import type { Friend } from '../../../infrastructure/supabase/queries/friends';
import type { RowState } from '../../../components/conversation/useRowState';

// One Messenger-style conversation = one friend, aggregating every interaction the
// pair has (video shares + reactions live in `threadIds`; the 1:1 DM lives in
// `dmChannelId`). Built client-side from the friends list (canonical key + avatar),
// the feed threads, and the private DM channels.
export type FriendConversation = {
  friendUserId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  threadIds: string[];     // inbound threads from this friend (sender === friend)
  dmChannelId: string | null;
  lastActivityAt: number;  // ms epoch, max across sources (0 = no activity yet)
  unreadCount: number;     // badge: items needing my attention
  state: RowState;
  subtitle: string;
  hasExclusiveDrop: boolean;
};

const ms = (iso?: string | null) => (iso ? Date.parse(iso) || 0 : 0);

export type BuildArgs = {
  friends: Friend[];
  threads: FeedThread[];
  dmChannels: ChannelSummary[];
  // channelId → other member's user id (from fetchPrivateChannelPeers)
  peerByChannel: Map<string, string>;
  myId: string;
  blocked: Set<string>;
  hidden: Set<string>;
};

export function buildFriendConversations({
  friends, threads, dmChannels, peerByChannel, myId, blocked, hidden,
}: BuildArgs): FriendConversation[] {
  // Seed from friends — the only source of avatars and the canonical id/handle.
  const map = new Map<string, FriendConversation>();
  for (const f of friends) {
    if (blocked.has(f.userId)) { continue; }
    map.set(f.userId, {
      friendUserId: f.userId,
      handle: f.handle,
      displayName: f.displayName,
      avatarUrl: f.avatarUrl,
      threadIds: [],
      dmChannelId: null,
      lastActivityAt: 0,
      unreadCount: 0,
      state: 'caughtup',
      subtitle: '',
      hasExclusiveDrop: false,
    });
  }

  // Per-friend tallies (kept separate so state precedence is explicit below).
  const tally = new Map<string, { pending: number; unreplied: number; dmUnread: number }>();
  const bump = (id: string) => {
    if (!tally.has(id)) { tally.set(id, { pending: 0, unreplied: 0, dmUnread: 0 }); }
    return tally.get(id)!;
  };

  // Fold INBOUND threads (a friend sent me a video). Outbound multi-recipient shares
  // can't be fanned out client-side (fetchFeedThreads returns only my membership) —
  // that's the documented backend fast-follow.
  for (const t of threads) {
    if (t.sender_id === myId) { continue; }
    if (hidden.has(t.id) || blocked.has(t.sender_id)) { continue; }
    const conv = map.get(t.sender_id);
    if (!conv) { continue; } // sender isn't a current friend
    conv.threadIds.push(t.id);
    conv.lastActivityAt = Math.max(conv.lastActivityAt, ms(t.created_at));
    const tl = bump(t.sender_id);
    if (t.my_status === 'pending') { tl.pending += 1; }
    else if (t.my_status !== 'reacted') { tl.unreplied += 1; } // seen but not reacted
  }

  // Fold 1:1 DM channels, mapped to their friend via the peer map. Group chats are
  // their own thing (handled by buildGroupConversations), never a friend conversation.
  for (const c of dmChannels) {
    if (c.is_group_chat) { continue; }
    const friendId = peerByChannel.get(c.id);
    if (!friendId) { continue; }              // group (3+) or unresolved → skip
    const conv = map.get(friendId);
    if (!conv) { continue; }
    conv.dmChannelId = c.id;
    conv.lastActivityAt = Math.max(conv.lastActivityAt, ms(c.last_message_at));
    bump(friendId).dmUnread += c.unread_count;
  }

  // Resolve state + badge + subtitle (precedence: unread → unreplied → caughtup).
  for (const conv of map.values()) {
    const tl = tally.get(conv.friendUserId) ?? { pending: 0, unreplied: 0, dmUnread: 0 };
    conv.unreadCount = tl.pending + tl.unreplied + tl.dmUnread;
    if (tl.pending > 0 || tl.dmUnread > 0) {
      conv.state = 'unread';
      conv.subtitle = tl.dmUnread > 0 && tl.pending === 0
        ? 'New message'
        : `${tl.pending + tl.dmUnread} new`;
    } else if (tl.unreplied > 0) {
      conv.state = 'unreplied';
      conv.subtitle = '👀 Waiting for your reaction';
    } else {
      conv.state = 'caughtup';
      conv.subtitle = conv.lastActivityAt > 0 ? 'Caught up' : 'Say hi 👋';
    }
  }

  // Most-recent activity first; friends with no history fall to the bottom (alpha).
  return [...map.values()].sort((a, b) => {
    if (a.lastActivityAt !== b.lastActivityAt) { return b.lastActivityAt - a.lastActivityAt; }
    return a.displayName.localeCompare(b.displayName);
  });
}

// A friends group chat (private channel with 3+ members). These are the DM channels NOT
// resolved to a single 1:1 peer. Auto-named by participants (DB trigger).
export type GroupConversation = {
  channelId: string;
  name: string;
  memberCount: number;
  lastActivityAt: number;
  unreadCount: number;
  state: RowState;
};

export function buildGroupConversations(
  dmChannels: ChannelSummary[],
): GroupConversation[] {
  return dmChannels
    .filter(c => c.is_group_chat === true) // group chats are explicitly flagged
    .map(c => ({
      channelId: c.id,
      name: c.name || 'Group chat',
      memberCount: c.member_count,
      lastActivityAt: c.last_message_at ? Date.parse(c.last_message_at) || 0 : 0,
      unreadCount: c.unread_count,
      state: (c.unread_count > 0 ? 'unread' : 'caughtup') as RowState,
    }))
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

// Unified, recency-sorted Feed list item: a per-friend conversation or a group chat.
export type FeedItem =
  | { kind: 'friend'; sortAt: number; conv: FriendConversation }
  | { kind: 'group'; sortAt: number; group: GroupConversation };

export function mergeFeedItems(
  friends: FriendConversation[],
  groups: GroupConversation[],
): FeedItem[] {
  const items: FeedItem[] = [
    ...friends.map(c => ({ kind: 'friend' as const, sortAt: c.lastActivityAt, conv: c })),
    ...groups.map(g => ({ kind: 'group' as const, sortAt: g.lastActivityAt, group: g })),
  ];
  return items.sort((a, b) => {
    if (a.sortAt !== b.sortAt) { return b.sortAt - a.sortAt; }
    // Stable-ish tiebreak: friends with no activity after groups with no activity.
    return a.kind === b.kind ? 0 : a.kind === 'group' ? -1 : 1;
  });
}
