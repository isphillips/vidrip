import { buildFriendConversations, buildGroupConversations, mergeFeedItems } from './friendConversation';
import type { Friend } from '../../../infrastructure/supabase/queries/friends';
import type { FeedThread } from '../../../infrastructure/supabase/queries/threads';
import type { ChannelSummary } from '../../../infrastructure/supabase/queries/channels';

const ME = 'me';

const friend = (userId: string, displayName = userId): Friend =>
  ({ userId, handle: userId, displayName, avatarUrl: null } as unknown as Friend);

const thread = (id: string, sender_id: string, my_status: string, created_at: string): FeedThread =>
  ({ id, sender_id, my_status, created_at } as unknown as FeedThread);

const dm = (
  id: string, last_message_at: string | null, unread_count = 0,
  is_group_chat = false, name = '', member_count = 2,
): ChannelSummary =>
  ({ id, last_message_at, unread_count, is_group_chat, name, member_count } as unknown as ChannelSummary);

const base = { myId: ME, blocked: new Set<string>(), hidden: new Set<string>() };
const build = (over: any) =>
  buildFriendConversations({ ...base, friends: [], threads: [], dmChannels: [], peerByChannel: new Map(), ...over });

describe('buildFriendConversations', () => {
  it('marks a friend who sent an unreacted video as unread/pending', () => {
    const [conv] = build({ friends: [friend('alice')], threads: [thread('t1', 'alice', 'pending', '2026-06-01T10:00:00Z')] });
    expect(conv.friendUserId).toBe('alice');
    expect(conv.unreadCount).toBe(1);
    expect(conv.state).toBe('unread');
    expect(conv.threadIds).toEqual(['t1']);
  });

  it('treats seen-but-not-reacted as unreplied', () => {
    const [conv] = build({ friends: [friend('alice')], threads: [thread('t1', 'alice', 'seen', '2026-06-01T10:00:00Z')] });
    expect(conv.state).toBe('unreplied');
    expect(conv.subtitle).toMatch(/waiting/i);
  });

  it('treats a reacted thread as caught up', () => {
    const [conv] = build({ friends: [friend('alice')], threads: [thread('t1', 'alice', 'reacted', '2026-06-01T10:00:00Z')] });
    expect(conv.unreadCount).toBe(0);
    expect(conv.state).toBe('caughtup');
  });

  it('ignores my own outbound threads', () => {
    const [conv] = build({ friends: [friend('alice')], threads: [thread('t1', ME, 'pending', '2026-06-01T10:00:00Z')] });
    expect(conv.threadIds).toEqual([]);
    expect(conv.unreadCount).toBe(0);
  });

  it('drops blocked senders and hidden threads', () => {
    const convs = build({
      friends: [friend('alice'), friend('bob')],
      threads: [thread('t1', 'alice', 'pending', '2026-06-01T10:00:00Z'), thread('t2', 'bob', 'pending', '2026-06-01T10:00:00Z')],
      blocked: new Set(['alice']),
      hidden: new Set(['t2']),
    });
    expect(convs.find((c: any) => c.friendUserId === 'alice')).toBeUndefined();
    expect(convs.find((c: any) => c.friendUserId === 'bob')?.unreadCount).toBe(0);
  });

  it('folds DM unread into the friend (unreadCount + dmUnread)', () => {
    const [conv] = build({
      friends: [friend('alice')],
      dmChannels: [dm('ch1', '2026-06-02T10:00:00Z', 3)],
      peerByChannel: new Map([['ch1', 'alice']]),
    });
    expect(conv.dmChannelId).toBe('ch1');
    expect(conv.dmUnread).toBe(3);
    expect(conv.unreadCount).toBe(3);
    expect(conv.state).toBe('unread');
  });

  it('sorts by most-recent activity first', () => {
    const convs = build({
      friends: [friend('alice'), friend('bob')],
      threads: [thread('t1', 'alice', 'reacted', '2026-06-01T10:00:00Z'), thread('t2', 'bob', 'reacted', '2026-06-05T10:00:00Z')],
    });
    expect(convs[0].friendUserId).toBe('bob');
  });
});

describe('buildGroupConversations', () => {
  it('keeps only group chats, sorted by recency, with unread state', () => {
    const chans = [
      dm('g1', '2026-06-01T00:00:00Z', 0, true, 'A', 3),
      dm('d1', '2026-06-02T00:00:00Z', 0, false),
      dm('g2', '2026-06-03T00:00:00Z', 2, true, 'B', 4),
    ];
    const groups = buildGroupConversations(chans);
    expect(groups.map(g => g.channelId)).toEqual(['g2', 'g1']);
    expect(groups[0].unreadCount).toBe(2);
    expect(groups[0].state).toBe('unread');
  });
});

describe('mergeFeedItems', () => {
  it('merges friends + groups and sorts by activity desc', () => {
    const friends = build({ friends: [friend('alice')], threads: [thread('t1', 'alice', 'reacted', '2026-06-04T00:00:00Z')] });
    const groups = buildGroupConversations([dm('g1', '2026-06-06T00:00:00Z', 1, true, 'G', 3)]);
    const merged = mergeFeedItems(friends, groups);
    expect(merged[0].kind).toBe('group');
    expect(merged.map(m => m.kind)).toContain('friend');
  });
});
