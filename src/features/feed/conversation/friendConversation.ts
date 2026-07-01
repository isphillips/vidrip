import type { FeedThread } from '../../../infrastructure/supabase/queries/threads';
import type { ChannelSummary, GroupMember, DmLastPost } from '../../../infrastructure/supabase/queries/channels';
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
  unreadCount: number;     // items needing my attention (reactions + DMs) — the Messages badge
  dmUnread: number;        // DM-message unread only — Messages uses this (reactions belong to Feed)
  reactionUnread: number;  // reaction REQUESTS only (pending + unreplied) — the Feed uses this so DM
                           // video/audio/text messages never surface a conversation in the Feed

  state: RowState;
  subtitle: string;
  // 1-line descriptor of the most-recent INBOUND interaction, e.g. "@maya sent a reaction"
  // ('' when the friend hasn't done anything yet). Shown as the Messages row preview line.
  preview: string;
  hasExclusiveDrop: boolean;
};

const ms = (iso?: string | null) => (iso ? Date.parse(iso) || 0 : 0);

// The kinds of inbound activity the Messages preview line describes (all things the FRIEND did to me).
type InboundKind = 'reaction' | 'reaction_request' | 'video_message' | 'audio_message';
const previewFor = (handle: string, kind: InboundKind): string =>
  kind === 'reaction' ? `@${handle} sent a reaction`
  : kind === 'reaction_request' ? `@${handle} requested a reaction`
  : kind === 'video_message' ? `@${handle} sent a video message`
  : `@${handle} sent an audio message`;

export type BuildArgs = {
  friends: Friend[];
  threads: FeedThread[];
  dmChannels: ChannelSummary[];
  // channelId → other member's user id (from fetchPrivateChannelPeers)
  peerByChannel: Map<string, string>;
  // channelId → its latest DM message (poster/type/time), for the video/audio preview line
  dmLastPosts: Map<string, DmLastPost>;
  myId: string;
  blocked: Set<string>;
  hidden: Set<string>;
};

export function buildFriendConversations({
  friends, threads, dmChannels, peerByChannel, dmLastPosts, myId, blocked, hidden,
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
      dmUnread: 0,
      reactionUnread: 0,
      state: 'caughtup',
      subtitle: '',
      preview: '',
      hasExclusiveDrop: false,
    });
  }

  // Per-friend tallies (kept separate so state precedence is explicit below).
  const tally = new Map<string, { pending: number; unreplied: number; dmUnread: number }>();
  const bump = (id: string) => {
    if (!tally.has(id)) { tally.set(id, { pending: 0, unreplied: 0, dmUnread: 0 }); }
    return tally.get(id)!;
  };

  // Most-recent INBOUND interaction per friend → drives the row preview line (and keeps the row's
  // recency in sync with things that don't otherwise touch lastActivityAt, e.g. a received reaction).
  const lastInbound = new Map<string, { at: number; kind: InboundKind }>();
  const noteInbound = (friendId: string, at: number, kind: InboundKind) => {
    if (at <= 0 || !map.has(friendId)) { return; }
    const cur = lastInbound.get(friendId);
    if (!cur || at > cur.at) { lastInbound.set(friendId, { at, kind }); }
  };

  // Fold INBOUND threads (a friend sent me a video to react to). Outbound multi-recipient shares
  // can't be fanned out client-side (fetchFeedThreads returns only my membership) —
  // that's the documented backend fast-follow.
  for (const t of threads) {
    if (t.sender_id === myId) { continue; }
    if (hidden.has(t.id) || blocked.has(t.sender_id)) { continue; }
    const conv = map.get(t.sender_id);
    if (!conv) { continue; } // sender isn't a current friend
    conv.threadIds.push(t.id);
    const at = ms(t.created_at);
    conv.lastActivityAt = Math.max(conv.lastActivityAt, at);
    noteInbound(t.sender_id, at, 'reaction_request');
    const tl = bump(t.sender_id);
    if (t.my_status === 'pending') { tl.pending += 1; }
    else if (t.my_status !== 'reacted') { tl.unreplied += 1; } // seen but not reacted
  }

  // Fold RECEIVED reactions (a friend reacted to a video I shared) from MY outbound threads — these
  // don't create an inbound thread, so without this a received reaction would never refresh the row.
  for (const t of threads) {
    if (t.sender_id !== myId) { continue; }
    for (const r of (t.reactions ?? [])) {
      if (r.userId === myId || blocked.has(r.userId)) { continue; }
      const conv = map.get(r.userId);
      if (!conv) { continue; }   // reactor isn't a current friend
      conv.lastActivityAt = Math.max(conv.lastActivityAt, r.at);
      noteInbound(r.userId, r.at, 'reaction');
    }
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
    // If the channel's LATEST message is a clip/audio the friend sent, surface it as the preview.
    const last = dmLastPosts.get(c.id);
    if (last && last.posterId === friendId) {
      if (last.postType === 'clip') { noteInbound(friendId, last.at, 'video_message'); }
      else if (last.postType === 'audio') { noteInbound(friendId, last.at, 'audio_message'); }
    }
  }

  // Resolve state + badge + subtitle + preview (precedence: unread → unreplied → caughtup).
  for (const conv of map.values()) {
    const tl = tally.get(conv.friendUserId) ?? { pending: 0, unreplied: 0, dmUnread: 0 };
    conv.unreadCount = tl.pending + tl.unreplied + tl.dmUnread;
    conv.dmUnread = tl.dmUnread;
    conv.reactionUnread = tl.pending + tl.unreplied;
    const li = lastInbound.get(conv.friendUserId);
    conv.preview = li ? previewFor(conv.handle, li.kind) : '';
    if (tl.pending > 0 || tl.dmUnread > 0) {
      conv.state = 'unread';
      conv.subtitle = tl.dmUnread > 0 && tl.pending === 0
        ? 'New message'
        : `${tl.pending + tl.dmUnread} new`;
    } else if (tl.unreplied > 0) {
      conv.state = 'unreplied';
      conv.subtitle = 'Waiting for your reaction';
    } else {
      conv.state = 'caughtup';
      conv.subtitle = conv.lastActivityAt > 0 ? 'Caught up' : 'Say hi';
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
  memberAvatars: GroupMember[];
};

export function buildGroupConversations(
  dmChannels: ChannelSummary[],
  memberAvatarMap: Map<string, GroupMember[]> = new Map(),
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
      memberAvatars: memberAvatarMap.get(c.id) ?? [],
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
