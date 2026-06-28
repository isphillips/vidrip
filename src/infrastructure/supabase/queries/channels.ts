import { log } from '../../logging/logger';
import RNFS from 'react-native-fs';
import { supabase, SUPABASE_ANON_KEY } from '../client';
import { fetchBlockedIds } from './blocks';
import { R2_ENABLED } from '../../storage/r2Config';
import { uploadToR2 } from '../../storage/uploadToR2';
import type { OverlayRecipe } from '../../../features/studio/effectRecipe';
import { DEMO_MODE } from '../../../demo/demoMode';
import {
  demoMemberVideos, demoChannelUpdates, demoPublicChannels, demoCreatorChannels, demoChannelPosts, demoGroupChats,
  demoPostReactions,
} from '../../../demo/demoData';

const STORAGE_BASE = 'https://ltpscwticavqutbzrrjb.supabase.co/storage/v1/object';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChannelSummary = {
  id: string;
  name: string;          // the channel's display title (consolidated from display_name)
  description: string | null;
  is_public: boolean;
  created_by: string;
  owner: { handle: string; avatar_url?: string | null } | null;
  pinned_video_id: string | null;
  pinned_video_title: string | null;
  pinned_video_thumbnail: string | null;
  // Owner-set channel intro video (groups.ad_video_*) — plays from the channel card.
  ad_video_url?: string | null;
  ad_video_duration?: number | null;
  member_count: number;
  // Count of top-level content posts (videos/clips, excluding reactions + status messages).
  post_count: number;
  is_joined: boolean;
  unread_count: number;
  last_message_at: string | null;
  is_members_only?: boolean;
  invite_only?: boolean;
  // True public visibility (groups.is_public). Distinct from is_public above, which
  // is forced true for Members Only channels so they get the public-style UI. An
  // owner's private/unlisted channel has is_listed=false and is hidden from the
  // public Members sections (it still shows under "My Channels").
  is_listed?: boolean;
  // For the current user, on invite-only channels: their relationship to the room.
  invite_status?: 'owner' | 'member' | 'pending' | 'none';
  avatar_url?: string | null;
  subscribed?: boolean;       // user has an active paid subscription to this room
  subscriber_mode?: boolean;  // the room is gated by paid subscription
  is_group_chat?: boolean;    // private multi-person chat (Feed), not a creator channel
};

export type ChannelPost = {
  id: string;
  channel_id: string;
  poster_id: string;
  poster: { handle: string } | null;
  post_type: 'youtube' | 'clip' | 'audio' | 'status' | 'creator';
  source_type: 'youtube' | 'tiktok' | 'instagram' | 'bunny' | 'facebook';
  yt_video_id: string | null;
  yt_video_title: string | null;
  yt_video_thumbnail: string | null;
  video_url: string | null;
  duration: number | null;
  is_pinned: boolean;
  created_at: string;
  message: string | null;
  emoji_reactions: { emoji: string; user_id: string }[];
  reaction_count: number;
  view_count?: number;
  has_my_reaction: boolean;
  review_count: number;
  has_my_review: boolean;
  parent_post_id: string | null;
  parent_yt_video_id: string | null;
  parent_source_type: 'youtube' | 'tiktok' | 'instagram' | 'bunny' | 'facebook';
  recorded_with_headphones?: boolean;
};

// A 60s review clip submitted to a creator after reacting. Lives in its own
// table (channel_reviews) so visibility can be gated by groups.reviews_enabled.
export type ChannelReview = {
  id: string;
  channel_id: string;
  post_id: string;
  reviewer_id: string;
  reviewer: { handle: string; avatar_url?: string | null } | null;
  video_url: string | null;
  duration: number | null;
  view_count: number;
  created_at: string;
  // Parent source-post context (populated by the inbox / my-reviews queries).
  post_yt_video_id: string | null;
  post_yt_video_title: string | null;
  post_yt_video_thumbnail: string | null;
  post_source_type: 'youtube' | 'tiktok' | 'instagram' | 'bunny' | 'facebook';
  channel_name: string | null;
};

// A channel-clip reaction (channel_posts row with parent_post_id set) the user
// recorded, flattened with its parent source-video + channel context. Powers the
// channel half of the feed's "My Reactions" tab.
export type MyChannelReaction = {
  id: string;                 // channel_posts.id (the reaction clip)
  channel_id: string;
  created_at: string;
  duration: number | null;
  channel_name: string | null;
  parent_yt_video_id: string | null;
  parent_yt_video_title: string | null;
  parent_yt_video_thumbnail: string | null;
  parent_source_type: 'youtube' | 'tiktok' | 'instagram' | 'bunny' | 'facebook';
};

// ── Queries ───────────────────────────────────────────────────────────────────

// Count top-level content posts (the channel's videos/clips) per channel, for the card stamp.
// Excludes reactions (parent_post_id set) and status messages. One grouped query in JS — avoids
// a per-channel round-trip and keeps it migration-free.
async function countPostsByChannel(channelIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!channelIds.length) { return counts; }
  const { data } = await (supabase as any)
    .from('channel_posts')
    .select('channel_id')
    .in('channel_id', channelIds)
    .is('parent_post_id', null)
    .neq('post_type', 'status');
  (data ?? []).forEach((p: any) => {
    counts.set(p.channel_id, (counts.get(p.channel_id) ?? 0) + 1);
  });
  return counts;
}

export async function fetchPublicChannels(userId: string): Promise<ChannelSummary[]> {
  if (DEMO_MODE) { return demoPublicChannels; }
  const [channelsResult, membershipsResult] = await Promise.all([
    (supabase as any)
      .from('groups')
      .select(`
        id, name, description, is_public, created_by, member_count,
        pinned_video_id, pinned_video_title, pinned_video_thumbnail, ad_video_url, ad_video_duration,
        owner:users!created_by(handle, avatar_url)
      `)
      .eq('is_public', true)
      // Members Only (creator) channels have their own sections — keep them out of
      // the Curated list even though they're now is_public=true for discovery.
      .eq('is_members_only', false)
      .order('member_count', { ascending: false }),
    (supabase as any)
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId),
  ]);

  if (channelsResult.error) { throw channelsResult.error; }

  const joinedIds = new Set<string>(
    (membershipsResult.data ?? []).map((m: any) => m.group_id),
  );

  const postCounts = await countPostsByChannel((channelsResult.data ?? []).map((c: any) => c.id));

  // Count unreacted YouTube posts per joined channel — drives the home-screen dot.
  const unreactedByChannel = new Map<string, number>();
  const joinedList = [...joinedIds];
  if (joinedList.length) {
    const [postsRes, mineRes] = await Promise.all([
      (supabase as any)
        .from('channel_posts')
        .select('id, channel_id, poster_id')
        .in('channel_id', joinedList)
        .eq('post_type', 'youtube')
        .is('parent_post_id', null),
      (supabase as any)
        .from('channel_posts')
        .select('parent_post_id')
        .eq('poster_id', userId)
        .not('parent_post_id', 'is', null),
    ]);
    const reacted = new Set<string>(
      (mineRes.data ?? []).map((r: any) => r.parent_post_id),
    );
    (postsRes.data ?? []).forEach((p: any) => {
      // Don't nag the user to react to their own posts (keeps an owner's own
      // channel from showing a permanent unread dot).
      if (p.poster_id !== userId && !reacted.has(p.id)) {
        unreactedByChannel.set(p.channel_id, (unreactedByChannel.get(p.channel_id) ?? 0) + 1);
      }
    });
  }

  return (channelsResult.data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    is_public: c.is_public,
    created_by: c.created_by,
    owner: c.owner ?? null,
    pinned_video_id: c.pinned_video_id ?? null,
    pinned_video_title: c.pinned_video_title ?? null,
    pinned_video_thumbnail: c.pinned_video_thumbnail ?? null,
    ad_video_url: c.ad_video_url ?? null,
    ad_video_duration: c.ad_video_duration ?? null,
    member_count: c.member_count ?? 0,
    post_count: postCounts.get(c.id) ?? 0,
    is_joined: joinedIds.has(c.id),
    unread_count: joinedIds.has(c.id) ? (unreactedByChannel.get(c.id) ?? 0) : 0,
    last_message_at: null,
  }));
}

export async function fetchMembersOnlyChannels(userId: string): Promise<ChannelSummary[]> {
  if (DEMO_MODE) { return demoCreatorChannels; }
  const [channelsResult, membershipsResult, invitesResult] = await Promise.all([
    (supabase as any)
      .from('groups')
      .select(`
        id, name, description, is_public, created_by, member_count, avatar_url, invite_only, subscriber_mode,
        pinned_video_id, pinned_video_title, pinned_video_thumbnail, ad_video_url, ad_video_duration,
        owner:users!created_by(handle, avatar_url)
      `)
      .eq('is_members_only', true)
      .eq('is_hidden', false)
      // Public visibility gate: only listed channels are discoverable, but an owner
      // always sees their own channel here even while it's private/unlisted.
      .or(`is_public.eq.true,created_by.eq.${userId}`)
      .order('member_count', { ascending: false }),
    (supabase as any).from('group_members').select('group_id').eq('user_id', userId),
    (supabase as any).from('channel_invites').select('channel_id').eq('invitee_id', userId).eq('status', 'pending'),
  ]);
  if (channelsResult.error) { throw channelsResult.error; }

  const joinedIds = new Set<string>((membershipsResult.data ?? []).map((m: any) => m.group_id));
  const pendingInviteIds = new Set<string>((invitesResult.data ?? []).map((i: any) => i.channel_id));

  const postCounts = await countPostsByChannel((channelsResult.data ?? []).map((c: any) => c.id));

  // Unreacted source posts per joined channel → home-screen dot.
  const unreactedByChannel = new Map<string, number>();
  const joinedList = [...joinedIds];
  if (joinedList.length) {
    const [postsRes, mineRes] = await Promise.all([
      (supabase as any).from('channel_posts')
        .select('id, channel_id, poster_id').in('channel_id', joinedList)
        .eq('post_type', 'youtube').is('parent_post_id', null),
      (supabase as any).from('channel_posts')
        .select('parent_post_id').eq('poster_id', userId).not('parent_post_id', 'is', null),
    ]);
    const reacted = new Set<string>((mineRes.data ?? []).map((r: any) => r.parent_post_id));
    (postsRes.data ?? []).forEach((p: any) => {
      // Skip the user's own posts — you don't react to your own videos, so they
      // shouldn't keep an owner's channel perpetually marked unread.
      if (p.poster_id !== userId && !reacted.has(p.id)) {
        unreactedByChannel.set(p.channel_id, (unreactedByChannel.get(p.channel_id) ?? 0) + 1);
      }
    });
  }

  return (channelsResult.data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    is_public: c.is_public,
    created_by: c.created_by,
    owner: c.owner ?? null,
    pinned_video_id: c.pinned_video_id ?? null,
    pinned_video_title: c.pinned_video_title ?? null,
    pinned_video_thumbnail: c.pinned_video_thumbnail ?? null,
    ad_video_url: c.ad_video_url ?? null,
    ad_video_duration: c.ad_video_duration ?? null,
    member_count: c.member_count ?? 0,
    post_count: postCounts.get(c.id) ?? 0,
    is_joined: joinedIds.has(c.id),
    unread_count: joinedIds.has(c.id) ? (unreactedByChannel.get(c.id) ?? 0) : 0,
    last_message_at: null,
    is_members_only: true,
    invite_only: !!c.invite_only,
    subscriber_mode: !!c.subscriber_mode,
    is_listed: !!c.is_public,
    invite_status: (
      c.created_by === userId ? 'owner'
      : joinedIds.has(c.id) ? 'member'
      : pendingInviteIds.has(c.id) ? 'pending'
      : 'none'
    ) as ChannelSummary['invite_status'],
    avatar_url: c.avatar_url ?? null,
  }));
}

export type MembersOnlyVideo = {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  sourceType: 'youtube' | 'tiktok' | 'instagram' | 'vidrip';
  videoUrl?: string | null;   // instagram plays from the re-hosted file (no embed)
  createdAt: string;          // recency axis for interleaving into the shorts feed
};

/** Recent source videos from JOINED Members Only channels, for the share browse grid. */
export async function fetchMembersOnlyVideos(userId: string, limit = 30): Promise<MembersOnlyVideo[]> {
  if (DEMO_MODE) { return demoMemberVideos; }
  // Only surface videos from Members Only channels the user has actually joined.
  const { data: memberships } = await (supabase as any)
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);
  const joinedIds = new Set<string>((memberships ?? []).map((m: any) => m.group_id));
  if (!joinedIds.size) { return []; }

  const { data: chans } = await (supabase as any)
    .from('groups')
    .select('id, owner:users!created_by(handle, avatar_url)')
    .eq('is_members_only', true)
    .eq('is_hidden', false)
    .in('id', [...joinedIds]);
  const ids: string[] = (chans ?? []).map((c: any) => c.id);
  if (!ids.length) { return []; }
  const handleById = new Map<string, string>(
    (chans ?? []).map((c: any) => [c.id, c.owner?.handle ?? '']),
  );

  const { data: posts } = await (supabase as any)
    .from('channel_posts')
    .select('channel_id, yt_video_id, yt_video_title, yt_video_thumbnail, source_type, video_url, created_at')
    .in('channel_id', ids)
    .eq('post_type', 'youtube')
    .eq('hidden', false)   // exclude videos from disabled creator accounts
    .is('parent_post_id', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (posts ?? [])
    .filter((p: any) => p.yt_video_id)
    .map((p: any) => ({
      videoId: p.yt_video_id,
      title: p.yt_video_title ?? '',
      thumbnail: p.yt_video_thumbnail ?? '',
      channelTitle: `@${handleById.get(p.channel_id) ?? ''}`,
      sourceType: (p.source_type ?? 'youtube') as 'youtube' | 'tiktok' | 'instagram',
      videoUrl: p.video_url ?? null,
      createdAt: p.created_at ?? '',
    }));
}

export async function fetchPrivateChannels(userId: string): Promise<ChannelSummary[]> {
  if (DEMO_MODE) { return demoGroupChats; }
  // Two-query approach: PostgREST join-filter syntax is unreliable for this case.
  const { data: memberships, error: mErr } = await (supabase as any)
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);

  if (mErr) { throw mErr; }

  const channelIds: string[] = (memberships ?? []).map((m: any) => m.group_id);
  if (channelIds.length === 0) { return []; }

  const { data, error } = await (supabase as any)
    .from('groups')
    .select(`
      id, name, description, is_public, created_by, member_count, is_group_chat,
      owner:users!created_by(handle, avatar_url)
    `)
    .eq('is_public', false)
    .eq('is_members_only', false)   // Members Only channels are public-style, not private DMs
    .in('id', channelIds)
    .order('created_at', { ascending: false });

  if (error) { throw error; }

  // Fetch unread counts via SECURITY DEFINER RPC
  const { data: unreadData } = await (supabase as any)
    .rpc('get_private_channels_with_unread', { p_user_id: userId });
  const unreadMap = new Map<string, { count: number; lastMsg: string | null }>();
  for (const row of (unreadData ?? [])) {
    unreadMap.set(row.channel_id, {
      count: Number(row.unread_count ?? 0),
      lastMsg: row.last_message_at ?? null,
    });
  }

  const channels = (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    is_public: false,
    created_by: c.created_by,
    owner: c.owner ?? null,
    pinned_video_id: null,
    pinned_video_title: null,
    pinned_video_thumbnail: null,
    member_count: c.member_count ?? 0,
    post_count: 0,
    is_joined: true,
    unread_count: unreadMap.get(c.id)?.count ?? 0,
    last_message_at: unreadMap.get(c.id)?.lastMsg ?? null,
    is_group_chat: !!c.is_group_chat,
  }));

  // Unread channels float to top, then sort by last message
  return channels.sort((a: ChannelSummary, b: ChannelSummary) => {
    if (a.unread_count > 0 && b.unread_count === 0) { return -1; }
    if (a.unread_count === 0 && b.unread_count > 0) { return 1; }
    const at = a.last_message_at ?? '';
    const bt = b.last_message_at ?? '';
    return bt.localeCompare(at);
  });
}

// Maps each given (private/DM) channel id → the OTHER member's user id, for the
// per-friend Feed grouping. 1:1 DMs have exactly two members; channels with a single
// resolvable peer are returned, group (3+) channels are skipped (no single friend).
export async function fetchPrivateChannelPeers(
  userId: string,
  channelIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (DEMO_MODE) { return map; }   // demo group chats need no peer mapping
  if (channelIds.length === 0) { return map; }
  const { data, error } = await (supabase as any)
    .from('group_members')
    .select('group_id, user_id')
    .in('group_id', channelIds);
  // Throw (don't silently return an EMPTY map) so callers can tell a transient failure from a real
  // "no peers" result — an empty map here unmaps every DM channel and collapses conversations.
  if (error) { throw error; }

  // group_id → set of member ids (excluding me)
  const peers = new Map<string, Set<string>>();
  for (const row of (data ?? [])) {
    if (row.user_id === userId) { continue; }
    if (!peers.has(row.group_id)) { peers.set(row.group_id, new Set()); }
    peers.get(row.group_id)!.add(row.user_id);
  }
  for (const [groupId, members] of peers) {
    if (members.size === 1) { map.set(groupId, [...members][0]); }
  }
  return map;
}

export type GroupMember = { url: string | null; initial: string };

// Fetches up to 4 other-member avatar + initial data per group chat channel — used for the
// iOS-style multi-avatar grid in the Messages list.
// Fetches up to 4 other-member avatar + initial data per group chat channel.
// Uses the get_channel_members SECURITY DEFINER RPC to bypass the group_members RLS
// policy (which only exposes the calling user's own membership row), then does a single
// batch users query for avatar_urls.
export async function fetchGroupChatMemberAvatars(
  userId: string,
  channelIds: string[],
): Promise<Map<string, GroupMember[]>> {
  const map = new Map<string, GroupMember[]>();
  if (DEMO_MODE || channelIds.length === 0) { return map; }

  // Step 1: get member ids + handles per channel via SECURITY DEFINER RPC.
  const rpcResults = await Promise.all(
    channelIds.map(async channelId => {
      const { data } = await (supabase as any)
        .rpc('get_channel_members', { p_channel_id: channelId });
      const others = (data ?? []).filter((m: any) => m.user_id !== userId);
      return { channelId, members: others.slice(0, 4) as any[] };
    }),
  );

  // Step 2: batch-fetch avatar_urls from users (likely readable for authenticated users).
  const allUserIds = [...new Set(rpcResults.flatMap(r => r.members.map((m: any) => m.user_id as string)))];
  const avatarByUser = new Map<string, string | null>();
  if (allUserIds.length > 0) {
    const { data: users } = await (supabase as any)
      .from('users')
      .select('id, avatar_url')
      .in('id', allUserIds);
    for (const u of (users ?? [])) { avatarByUser.set(u.id, u.avatar_url ?? null); }
  }

  // Step 3: build the final map.
  for (const { channelId, members } of rpcResults) {
    if (!members.length) { continue; }
    const result: GroupMember[] = members.map((m: any) => {
      const name: string = m.display_name || m.handle || '?';
      // avatar_url may come from the RPC (if it includes it) or from the users batch.
      const url = (m.avatar_url as string | undefined) ?? avatarByUser.get(m.user_id) ?? null;
      return { url, initial: name.charAt(0).toUpperCase() };
    });
    map.set(channelId, result);
  }

  return map;
}

export async function markChannelAsRead(channelId: string): Promise<void> {
  await (supabase as any)
    .from('group_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('group_id', channelId);
}

export async function ensurePrivateChannel(userA: string, userB: string): Promise<string> {
  const { data, error } = await (supabase as any)
    .rpc('ensure_private_channel', { user_a: userA, user_b: userB });
  if (error) { throw error; }
  return data as string;
}

/**
 * Find the EXISTING 1:1 DM channel between two users without creating one — the private channel both
 * are members of that isn't a group chat. Used to load real DM history on entry (vs. ensurePrivateChannel,
 * which can mint a fresh/empty channel). Returns null if none exists.
 */
export async function findPrivateChannel(userId: string, friendUserId: string): Promise<string | null> {
  const { data: mine, error: e1 } = await (supabase as any)
    .from('group_members').select('group_id').eq('user_id', userId);
  if (e1) { return null; }
  const myIds: string[] = (mine ?? []).map((m: any) => m.group_id);
  if (myIds.length === 0) { return null; }

  const { data: shared, error: e2 } = await (supabase as any)
    .from('group_members').select('group_id').eq('user_id', friendUserId).in('group_id', myIds);
  if (e2) { return null; }
  const sharedIds: string[] = (shared ?? []).map((m: any) => m.group_id);
  if (sharedIds.length === 0) { return null; }

  // Prefer the 1:1 (non-group) channel; oldest wins if somehow duplicated.
  const { data: groups } = await (supabase as any)
    .from('groups')
    .select('id, is_group_chat, created_at')
    .in('id', sharedIds)
    .eq('is_public', false)
    .order('created_at', { ascending: true });
  const list = (groups ?? []) as any[];
  const oneToOne = list.find(g => g.is_group_chat === false) ?? list[0];
  return oneToOne?.id ?? null;
}

export type ChannelUpdateSummary = {
  channel_id: string;
  name: string;
  unseen_count: number;
  // Recency axis for interleaving the channel row into the Feed (last unseen upload).
  last_unseen_at: string | null;
  is_members_only: boolean;
  kind: 'channel' | 'group';
};

// One call powering the Feed "Channels" rows + ticker — channels (public/members-only) the
// user is in that have unseen updates, with a per-channel count and the most-recent unseen
// upload time (so the Feed can slot each channel into its recency-sorted list).
export async function fetchChannelUpdatesSummary(userId: string): Promise<ChannelUpdateSummary[]> {
  if (DEMO_MODE) { return demoChannelUpdates; }
  const { data, error } = await (supabase as any)
    .rpc('get_channel_updates_summary', { p_user_id: userId });
  if (error) { return []; }
  return (data ?? []).map((r: any) => ({
    channel_id: r.channel_id,
    name: r.name ?? 'a channel',
    unseen_count: Number(r.unseen_count ?? 0),
    last_unseen_at: r.last_unseen_at ?? null,
    is_members_only: !!r.is_members_only,
    kind: (r.kind === 'group' ? 'group' : 'channel') as 'channel' | 'group',
  }));
}

// Create a friends-only group chat (private channel with >=2 other members). Auto-named
// from participant handles by a DB trigger. Returns the new channel id.
export async function createGroupChat(memberIds: string[]): Promise<string> {
  const { data, error } = await (supabase as any)
    .rpc('create_group_chat', { p_member_ids: memberIds });
  if (error) { throw new Error(error.message ?? 'Could not create group chat'); }
  return data as string;
}

// Rename a group chat (any member). Empty name reverts to the auto participant name.
export async function renameGroupChat(channelId: string, name: string): Promise<void> {
  const { error } = await (supabase as any)
    .rpc('rename_group_chat', { p_channel_id: channelId, p_name: name });
  if (error) { throw new Error(error.message ?? 'Could not rename group chat'); }
}

// ── App-wide block filtering ─────────────────────────────────────────────────────────────────
// A blocked user (someone I blocked, OR who blocked me) must disappear from every channel surface
// — posts, reactions, reviews, members (App Store 1.2). Resolved per query from `fetchBlockedIds`
// so all consumer screens are covered centrally; returns the shared empty set (no work) when the
// viewer has blocked no one. Falls back to the session user when no id is passed.
const NO_BLOCKS: ReadonlySet<string> = new Set<string>();
async function viewerBlockedIds(userId?: string): Promise<ReadonlySet<string>> {
  let id = userId;
  if (!id) {
    const { data } = await supabase.auth.getSession();
    id = data.session?.user?.id;
  }
  if (!id) { return NO_BLOCKS; }
  const ids = await fetchBlockedIds(id);
  return ids.length ? new Set(ids) : NO_BLOCKS;
}

export async function fetchChannelPosts(
  channelId: string, userId?: string, opts?: { limit?: number },
): Promise<ChannelPost[]> {
  if (DEMO_MODE) { return demoChannelPosts; }
  let query = (supabase as any)
    .from('channel_posts')
    .select(`
      id, channel_id, poster_id, post_type, source_type, message,
      yt_video_id, yt_video_title, yt_video_thumbnail,
      video_url, duration, is_pinned, view_count, created_at,
      poster:users!poster_id(handle),
      emoji_reactions:channel_post_emoji_reactions(emoji, user_id),
      reactions:channel_posts!parent_post_id(count)
    `)
    .eq('channel_id', channelId)
    .eq('hidden', false)   // exclude videos from disabled creator accounts
    .is('parent_post_id', null)
    // Scheduled creator posts stay hidden until their release_date passes (null = publish now).
    .or(`release_date.is.null,release_date.lte.${new Date().toISOString()}`)
    // Exclusive posts (in a collection) never appear in the regular feed — only inside their collection.
    .eq('is_exclusive', false)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });
  // Paginated callers (the DM conversation) take the latest N; everyone else gets the full set.
  if (opts?.limit) { query = query.limit(opts.limit); }
  const { data, error } = await query;

  if (error) { throw error; }

  let reactedIds = new Set<string>();
  if (userId) {
    const { data: mine } = await (supabase as any)
      .from('channel_posts')
      .select('parent_post_id')
      .eq('poster_id', userId)
      .eq('channel_id', channelId)
      .not('parent_post_id', 'is', null);
    if (mine) { reactedIds = new Set((mine as any[]).map(r => r.parent_post_id)); }
  }

  // Review counts per source post. RLS gates which review rows are visible, so a
  // non-creator with reviews disabled only ever counts their own.
  const reviewCount = new Map<string, number>();
  const myReviewed = new Set<string>();
  const { data: revs } = await (supabase as any)
    .from('channel_reviews')
    .select('post_id, reviewer_id')
    .eq('channel_id', channelId);
  (revs ?? []).forEach((r: any) => {
    reviewCount.set(r.post_id, (reviewCount.get(r.post_id) ?? 0) + 1);
    if (userId && r.reviewer_id === userId) { myReviewed.add(r.post_id); }
  });

  // App-wide block: hide posts authored by a blocked user outright, and don't let a blocked user's
  // reaction inflate a post's tally. The grid badge uses a server count() that doesn't know about
  // blocks, so we also subtract blocked posters' reactions per post. One small query (only blocked-user
  // reactions), skipped entirely when the viewer has blocked no one.
  const blocked = await viewerBlockedIds(userId);
  const blockedDecr = new Map<string, number>();
  if (blocked.size) {
    const postIds = (data ?? []).map((p: any) => p.id);
    if (postIds.length) {
      const { data: blockedRx } = await (supabase as any)
        .from('channel_posts')
        .select('parent_post_id')
        .in('parent_post_id', postIds)
        .in('poster_id', [...blocked]);
      (blockedRx ?? []).forEach((r: any) => {
        blockedDecr.set(r.parent_post_id, (blockedDecr.get(r.parent_post_id) ?? 0) + 1);
      });
    }
  }

  return (data ?? [])
    .filter((p: any) => !blocked.has(p.poster_id))
    .map((p: any) => ({
    id: p.id,
    channel_id: p.channel_id,
    poster_id: p.poster_id,
    poster: p.poster ?? null,
    post_type: p.post_type,
    source_type: p.source_type ?? 'youtube',
    yt_video_id: p.yt_video_id ?? null,
    yt_video_title: p.yt_video_title ?? null,
    yt_video_thumbnail: p.yt_video_thumbnail ?? null,
    video_url: p.video_url ?? null,
    duration: p.duration ?? null,
    is_pinned: p.is_pinned,
    created_at: p.created_at,
    message: p.message ?? null,
    emoji_reactions: p.emoji_reactions ?? [],
    reaction_count: Math.max(0, (Array.isArray(p.reactions) ? (p.reactions[0]?.count ?? 0) : 0) - (blockedDecr.get(p.id) ?? 0)),
    view_count: p.view_count ?? 0,
    has_my_reaction: reactedIds.has(p.id),
    review_count: reviewCount.get(p.id) ?? 0,
    has_my_review: myReviewed.has(p.id),
    parent_post_id: p.parent_post_id ?? null,
    parent_yt_video_id: null,
    parent_source_type: 'youtube',
  }));
}

export async function fetchChannelMembers(channelId: string): Promise<{ userId: string; handle: string }[]> {
  const { data, error } = await (supabase as any)
    .rpc('get_channel_members', { p_channel_id: channelId });
  if (error) { throw error; }
  const blocked = await viewerBlockedIds();
  return (data ?? [])
    .filter((m: any) => !blocked.has(m.user_id))
    .map((m: any) => ({ userId: m.user_id as string, handle: m.handle as string }));
}

export async function fetchChannelName(channelId: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from('groups').select('name').eq('id', channelId).single();
  return data?.name ?? null;
}

// ── Admin: roles + member moderation ────────────────────────────────────────────

export type ChannelRole = 'owner' | 'admin' | 'member';
export type ChannelMemberAdmin = {
  userId: string; handle: string; displayName: string | null; avatarUrl: string | null;
  role: ChannelRole; joinedAt: string; mutedUntil: string | null;
};

/** The viewer's effective role in a channel (owner via created_by, else group_members.role). */
export async function fetchMyChannelRole(channelId: string, userId: string): Promise<ChannelRole | null> {
  const { data: g } = await (supabase as any).from('groups').select('created_by').eq('id', channelId).maybeSingle();
  if (g?.created_by === userId) { return 'owner'; }
  const { data: m } = await (supabase as any).from('group_members').select('role').eq('group_id', channelId).eq('user_id', userId).maybeSingle();
  return (m?.role as ChannelRole | undefined) ?? null;
}

/** Full member list with role/profile/mute (owner/admin only — returns [] otherwise). */
export async function fetchChannelMembersAdmin(channelId: string): Promise<ChannelMemberAdmin[]> {
  const { data, error } = await (supabase as any).rpc('get_channel_members_admin', { p_channel: channelId });
  if (error) { throw error; }
  return (data ?? []).map((m: any) => ({
    userId: m.user_id, handle: m.handle, displayName: m.display_name ?? null, avatarUrl: m.avatar_url ?? null,
    role: m.role as ChannelRole, joinedAt: m.joined_at, mutedUntil: m.muted_until ?? null,
  }));
}

async function modRpc(fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await (supabase as any).rpc(fn, args);
  if (error) { throw new Error(error.message ?? 'Action failed'); }
}
export const promoteMember = (channelId: string, userId: string, role: 'admin' | 'member') =>
  modRpc('promote_member', { p_channel: channelId, p_user: userId, p_role: role });
export const muteMember = (channelId: string, userId: string, hours: number) =>
  modRpc('mute_member', { p_channel: channelId, p_user: userId, p_hours: hours });
export const unmuteMember = (channelId: string, userId: string) =>
  modRpc('unmute_member', { p_channel: channelId, p_user: userId });
export const kickMember = (channelId: string, userId: string) =>
  modRpc('kick_member', { p_channel: channelId, p_user: userId });
export const banMember = (channelId: string, userId: string) =>
  modRpc('ban_member', { p_channel: channelId, p_user: userId });

// ── Channel advertisement / intro video ────────────────────────────────────────

/** The channel's owner/admin-set intro/advertising video (shown on the channel). */
export async function fetchChannelAdVideo(channelId: string): Promise<{ url: string | null; duration: number | null }> {
  const { data } = await (supabase as any)
    .from('groups').select('ad_video_url, ad_video_duration').eq('id', channelId).single();
  return { url: data?.ad_video_url ?? null, duration: data?.ad_video_duration ?? null };
}

/** Set (or clear) the channel ad video via the owner/admin-gated RPC. */
export async function setChannelAdVideo(channelId: string, url: string | null, duration: number | null): Promise<void> {
  const { error } = await (supabase as any)
    .rpc('set_channel_ad_video', { p_channel: channelId, p_url: url, p_duration: duration });
  if (error) { throw error; }
}

/** Upload a recorded/picked clip to the public channel-clips bucket and set it as the channel
 *  ad video. Returns the public URL. */
export async function uploadChannelAdVideo(channelId: string, localUri: string, durationSec?: number): Promise<string> {
  // Keep file:// and content:// schemes as-is (RN's uploader reads both on Android); only a
  // bare path needs a file:// prefix.
  const fileUri = /^(file|content):\/\//.test(localUri) ? localUri : `file://${localUri}`;
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) { throw new Error('Not authenticated'); }
  // The channel-clips bucket's insert policy requires the FIRST folder to be the uploader's uid.
  const path = `${session!.user.id}/channel-ads/${channelId}-${Date.now()}.mp4`;
  const form = new FormData();
  (form as any).append('file', { uri: fileUri, type: 'video/mp4', name: 'ad.mp4' });
  const res = await fetch(`${STORAGE_BASE}/channel-clips/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'x-upsert': 'true' },
    body: form,
  });
  if (!res.ok) { throw new Error(`ad video upload ${res.status}: ${await res.text().catch(() => '')}`); }
  const { data: { publicUrl } } = supabase.storage.from('channel-clips').getPublicUrl(path);
  await setChannelAdVideo(channelId, publicUrl, durationSec ? Math.round(durationSec) : null);
  return publicUrl;
}

export async function fetchChannelPostReactions(parentPostId: string): Promise<ChannelPost[]> {
  if (DEMO_MODE) { return demoPostReactions; }
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .select(`
      id, channel_id, poster_id, post_type, source_type, message,
      yt_video_id, yt_video_title, yt_video_thumbnail,
      video_url, duration, is_pinned, view_count, created_at,
      poster:users!poster_id(handle),
      emoji_reactions:channel_post_emoji_reactions(emoji, user_id)
    `)
    .eq('parent_post_id', parentPostId)
    .order('created_at', { ascending: true });

  if (error) { throw error; }
  const blocked = await viewerBlockedIds();
  return (data ?? [])
    .filter((p: any) => !blocked.has(p.poster_id))
    .map((p: any) => ({
    id: p.id,
    channel_id: p.channel_id,
    poster_id: p.poster_id,
    poster: p.poster ?? null,
    post_type: p.post_type,
    source_type: p.source_type ?? 'youtube',
    yt_video_id: p.yt_video_id ?? null,
    yt_video_title: p.yt_video_title ?? null,
    yt_video_thumbnail: p.yt_video_thumbnail ?? null,
    video_url: p.video_url ?? null,
    duration: p.duration ?? null,
    is_pinned: p.is_pinned,
    created_at: p.created_at,
    message: p.message ?? null,
    emoji_reactions: p.emoji_reactions ?? [],
    reaction_count: 0,
    view_count: p.view_count ?? 0,
    has_my_reaction: false,
    review_count: 0,
    has_my_review: false,
    parent_post_id: p.parent_post_id ?? null,
    parent_yt_video_id: null,
    parent_source_type: 'youtube',
  }));
}

// A reaction/review clip flattened for the channel grid, with the source video it
// hangs off for the thumbnail.
export type ChannelClipTile = {
  id: string;
  handle: string | null;
  duration: number | null;
  view_count: number;
  created_at: string;
  parent_yt_video_id: string | null;
  parent_yt_video_title: string | null;
  parent_yt_video_thumbnail: string | null;
  parent_source_type: 'youtube' | 'tiktok' | 'instagram' | 'bunny' | 'facebook';
};

// An unreacted source video from a channel the user has joined.
export type ChannelToReact = {
  postId: string;
  channelId: string;
  channelName: string;
  title: string | null;
  videoId: string | null;
  thumbnail: string | null;        // stored (TikTok ones may be expired — resolve at render)
  sourceType: 'youtube' | 'tiktok' | 'instagram';
  createdAt: string;
};

/** Source videos from JOINED channels the user hasn't reacted to yet, newest first. */
export async function fetchChannelsToReact(userId: string): Promise<ChannelToReact[]> {
  const { data: memberships } = await (supabase as any)
    .from('group_members').select('group_id').eq('user_id', userId);
  const channelIds: string[] = (memberships ?? []).map((m: any) => m.group_id);
  if (!channelIds.length) { return []; }

  const [postsRes, mineRes, groupsRes] = await Promise.all([
    (supabase as any)
      .from('channel_posts')
      .select('id, channel_id, poster_id, yt_video_id, yt_video_title, yt_video_thumbnail, source_type, created_at')
      .in('channel_id', channelIds)
      .eq('post_type', 'youtube')
      .eq('hidden', false)
      .is('parent_post_id', null)
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('channel_posts')
      .select('parent_post_id')
      .eq('poster_id', userId)
      .not('parent_post_id', 'is', null),
    (supabase as any)
      .from('groups')
      .select('id, name, is_members_only, owner:users!created_by(handle)')
      .in('id', channelIds),
  ]);

  const blocked = await viewerBlockedIds(userId);
  const reacted = new Set<string>((mineRes.data ?? []).map((r: any) => r.parent_post_id));
  const nameById = new Map<string, string>();
  (groupsRes.data ?? []).forEach((g: any) => {
    const fallback = g.is_members_only && !g.name && g.owner?.handle ? `@${g.owner.handle}` : (g.name ?? '');
    nameById.set(g.id, fallback);
  });

  return (postsRes.data ?? [])
    .filter((p: any) => !reacted.has(p.id) && p.poster_id !== userId && !blocked.has(p.poster_id))
    .map((p: any) => ({
      postId: p.id,
      channelId: p.channel_id,
      channelName: nameById.get(p.channel_id) ?? '',
      title: p.yt_video_title ?? null,
      videoId: p.yt_video_id ?? null,
      thumbnail: p.yt_video_thumbnail ?? null,
      sourceType: (p.source_type ?? 'youtube') as 'youtube' | 'tiktok' | 'instagram',
      createdAt: p.created_at ?? '',
    }));
}

/** Every reaction clip in a channel (children of source posts), newest first. */
export async function fetchChannelReactions(channelId: string): Promise<ChannelClipTile[]> {
  // Two queries on purpose: a self-referential PostgREST embed
  // (channel_posts!parent_post_id) is ambiguous with the children embed and
  // doesn't reliably return the parent — fetch parents explicitly and stitch.
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .select('id, poster_id, duration, view_count, created_at, parent_post_id, poster:users!poster_id(handle)')
    .eq('channel_id', channelId)
    .not('parent_post_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) { throw error; }
  const blocked = await viewerBlockedIds();
  const rows = (data ?? []).filter((r: any) => !blocked.has(r.poster_id));

  const parentIds = [...new Set(rows.map((r: any) => r.parent_post_id).filter(Boolean))];
  const parents = new Map<string, any>();
  if (parentIds.length) {
    const { data: pdata } = await (supabase as any)
      .from('channel_posts')
      .select('id, yt_video_id, yt_video_title, yt_video_thumbnail, source_type')
      .in('id', parentIds);
    (pdata ?? []).forEach((p: any) => parents.set(p.id, p));
  }

  return rows.map((p: any) => {
    const par = parents.get(p.parent_post_id);
    return {
    id: p.id,
    handle: p.poster?.handle ?? null,
    duration: p.duration ?? null,
    view_count: p.view_count ?? 0,
    created_at: p.created_at,
    parent_yt_video_id: par?.yt_video_id ?? null,
    parent_yt_video_title: par?.yt_video_title ?? null,
    parent_yt_video_thumbnail: par?.yt_video_thumbnail ?? null,
    parent_source_type: par?.source_type ?? 'youtube',
    };
  });
}

export async function fetchChannelPost(postId: string): Promise<ChannelPost | null> {
  if (DEMO_MODE) { return demoChannelPosts.find(p => p.id === postId) ?? demoChannelPosts[0]; }
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .select(`
      id, channel_id, poster_id, post_type, source_type, message,
      yt_video_id, yt_video_title, yt_video_thumbnail,
      video_url, duration, is_pinned, view_count, created_at, recorded_with_headphones,
      parent_post_id,
      parent:channel_posts!parent_post_id(yt_video_id, source_type),
      poster:users!poster_id(handle),
      emoji_reactions:channel_post_emoji_reactions(emoji, user_id)
    `)
    .eq('id', postId)
    .single();

  if (error) { return null; }
  return {
    ...data,
    poster: data.poster ?? null,
    source_type: data.source_type ?? 'youtube',
    message: data.message ?? null,
    emoji_reactions: data.emoji_reactions ?? [],
    reaction_count: 0,
    has_my_reaction: false,
    review_count: 0,
    has_my_review: false,
    parent_post_id: data.parent_post_id ?? null,
    parent_yt_video_id: (data.parent as any)?.yt_video_id ?? null,
    parent_source_type: (data.parent as any)?.source_type ?? 'youtube',
  };
}

export async function postYouTubeToChannel(params: {
  channelId: string;
  userId: string;
  ytVideoId: string;
  ytVideoTitle: string | null;
  ytVideoThumbnail: string | null;
  sourceType?: 'youtube' | 'tiktok' | 'instagram';
}): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .insert({
      channel_id: params.channelId,
      poster_id: params.userId,
      post_type: 'youtube',
      source_type: params.sourceType ?? 'youtube',
      yt_video_id: params.ytVideoId,
      yt_video_title: params.ytVideoTitle,
      yt_video_thumbnail: params.ytVideoThumbnail,
      is_pinned: false,
    })
    .select('id')
    .single();
  if (error) { throw error; }

  // Keep the channel card thumbnail current with the latest post
  await (supabase as any)
    .from('groups')
    .update({
      pinned_video_id: params.ytVideoId,
      pinned_video_title: params.ytVideoTitle,
      pinned_video_thumbnail: params.ytVideoThumbnail,
    })
    .eq('id', params.channelId);

  return data.id as string;
}

export async function togglePinPost(postId: string, pin: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from('channel_posts')
    .update({ is_pinned: pin })
    .eq('id', postId);
  if (error) { throw error; }
}

export type ChannelTier = { id: string; title: string; price_cents: number };

// What the fan actually pays: tier price + Stripe processing (2.9%+30¢) + 1%
// platform margin, so the creator nets their full price. Mirrors the web's
// fanCheckoutAmounts / fanPriceCents so the paywall matches Stripe Checkout.
export function fanPriceCents(priceCents: number): number {
  return Math.ceil((priceCents * 1.01 + 30) / (1 - 0.029));
}
export type ChannelAccess = { gated: boolean; tiers: ChannelTier[]; myTier?: string | null; subscriberMode?: boolean };

// Subscriber-mode entitlement: a creator's subscriber room is locked to active
// subscribers (and the owner). Returns gated=true + the tiers to show a paywall,
// or (when entitled) myTier = the name of the tier the user subscribes to.
export async function fetchChannelAccess(channelId: string, userId?: string): Promise<ChannelAccess> {
  const { data: g } = await (supabase as any)
    .from('groups').select('subscriber_mode, created_by').eq('id', channelId).single();
  const subscriberMode = !!g?.subscriber_mode;
  const isOwner = !!userId && g?.created_by === userId;
  if (!subscriberMode || isOwner) { return { gated: false, tiers: [], subscriberMode }; }

  if (userId) {
    const { data: ok } = await (supabase as any)
      .rpc('has_active_channel_sub', { uid: userId, p_channel_id: channelId });
    if (ok) {
      const { data: sub } = await (supabase as any)
        .from('channel_subscriptions')
        .select('tier:channel_subscription_tiers!tier_id(title)')
        .eq('user_id', userId).eq('channel_id', channelId).maybeSingle();
      return { gated: false, tiers: [], myTier: sub?.tier?.title ?? null, subscriberMode: true };
    }
  }

  const { data: tiers } = await (supabase as any)
    .from('channel_subscription_tiers')
    .select('id, title, price_cents')
    .eq('channel_id', channelId).eq('active', true)
    .order('idx', { ascending: true });
  return { gated: true, tiers: (tiers ?? []) as ChannelTier[], subscriberMode: true };
}

// Rooms the user actively subscribes to (for the "Subscribed" channels section).
// Returns ChannelSummary so they render/navigate like any other channel.
// Every creator channel the CURRENT user owns — regardless of listed/hidden/private — so an owner
// always sees their own channels (the public sections drop unlisted/hidden ones). is_members_only=true
// is the creator-channel marker, which also keeps DMs/group chats out.
export async function fetchMyChannels(userId: string): Promise<ChannelSummary[]> {
  if (DEMO_MODE) { return []; }
  const { data, error } = await (supabase as any)
    .from('groups')
    .select(`
      id, name, description, is_public, created_by, member_count, avatar_url, invite_only, subscriber_mode,
      pinned_video_id, pinned_video_title, pinned_video_thumbnail, ad_video_url, ad_video_duration,
      owner:users!created_by(handle, avatar_url)
    `)
    .eq('created_by', userId)
    .eq('is_members_only', true)
    .order('member_count', { ascending: false });
  if (error) { throw error; }

  const postCounts = await countPostsByChannel((data ?? []).map((c: any) => c.id));

  return ((data ?? []) as any[]).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    is_public: c.is_public,
    created_by: c.created_by,
    owner: c.owner ?? null,
    pinned_video_id: c.pinned_video_id ?? null,
    pinned_video_title: c.pinned_video_title ?? null,
    pinned_video_thumbnail: c.pinned_video_thumbnail ?? null,
    ad_video_url: c.ad_video_url ?? null,
    ad_video_duration: c.ad_video_duration ?? null,
    member_count: c.member_count ?? 0,
    post_count: postCounts.get(c.id) ?? 0,
    is_joined: true,
    unread_count: 0,
    last_message_at: null,
    is_members_only: true,
    invite_only: !!c.invite_only,
    subscriber_mode: !!c.subscriber_mode,
    is_listed: !!c.is_public,
    invite_status: 'owner' as ChannelSummary['invite_status'],
    avatar_url: c.avatar_url ?? null,
  })) as ChannelSummary[];
}

export async function fetchSubscribedChannels(userId: string): Promise<ChannelSummary[]> {
  if (DEMO_MODE) { return []; }   // demo: keep the Subscribed section empty (avoid dup channels)
  const nowIso = new Date().toISOString();
  const { data: subs } = await (supabase as any)
    .from('channel_subscriptions')
    .select('channel_id, status, current_period_end')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing']);
  const ids = (subs ?? [])
    .filter((s: any) => !s.current_period_end || s.current_period_end > nowIso)
    .map((s: any) => s.channel_id);
  if (!ids.length) { return []; }

  const { data: groups } = await (supabase as any)
    .from('groups')
    .select('id, name, description, is_public, is_members_only, member_count, created_by, avatar_url')
    .in('id', ids);

  const ownerIds = [...new Set((groups ?? []).map((g: any) => g.created_by).filter(Boolean))];
  const owners: Record<string, { handle: string; avatar_url: string | null }> = {};
  if (ownerIds.length) {
    const { data: us } = await (supabase as any).from('users').select('id, handle, avatar_url').in('id', ownerIds);
    for (const u of (us ?? [])) { owners[u.id] = { handle: u.handle, avatar_url: u.avatar_url ?? null }; }
  }

  const postCounts = await countPostsByChannel((groups ?? []).map((g: any) => g.id));

  return ((groups ?? []) as any[]).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description ?? null,
    is_public: !!g.is_public,
    created_by: g.created_by,
    owner: g.created_by ? { handle: owners[g.created_by]?.handle ?? '', avatar_url: owners[g.created_by]?.avatar_url ?? null } : null,
    pinned_video_id: null,
    pinned_video_title: null,
    pinned_video_thumbnail: null,
    member_count: g.member_count ?? 0,
    post_count: postCounts.get(g.id) ?? 0,
    is_joined: true,
    unread_count: 0,
    last_message_at: null,
    is_members_only: !!g.is_members_only,
    invite_only: false,
    is_listed: true,
    invite_status: 'member' as const,
    avatar_url: g.avatar_url ?? null,
    subscribed: true,
  })) as ChannelSummary[];
}

// NOTE: the app carries NO subscription surface at all for App Store 3.1.1 / reader-app compliance —
// no payment, no subscription management, and no read-only "memberships" list that would reference
// purchasing or the web. Members who have access simply see channel content directly; non-members see
// a neutral "Members only" lock (SubscriberPaywall) that points nowhere. Subscriptions are created and
// managed entirely on the web, with no in-app reference to that.

export async function joinChannel(channelId: string, userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('group_members')
    .insert({ group_id: channelId, user_id: userId, role: 'member' });
  if (error) { throw error; }
}

export async function leaveChannel(channelId: string, userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('group_members')
    .delete()
    .eq('group_id', channelId)
    .eq('user_id', userId);
  if (error) { throw error; }
}

export async function addChannelPostEmojiReaction(
  postId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  // No `.select()` back: the insert succeeds, but reading the row back is RLS-restricted for some
  // channel viewers, and that threw — which reverted the optimistic reaction (it showed, then vanished).
  // Ignore duplicate-key (already reacted) so a re-add is a harmless no-op.
  const { error } = await (supabase as any)
    .from('channel_post_emoji_reactions')
    .insert({ post_id: postId, user_id: userId, emoji });
  if (error && (error as any).code !== '23505') { throw error; }
}

async function uploadClipToCloud(localPath: string, uploadPath: string): Promise<string> {
  if (R2_ENABLED) { return uploadToR2('channel-clips', uploadPath, localPath); }

  const fileUri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) { throw new Error('Not authenticated'); }

  const formData = new FormData();
  (formData as any).append('file', { uri: fileUri, type: 'video/mp4', name: 'video.mp4' });

  const uploadUrl = `https://ltpscwticavqutbzrrjb.supabase.co/storage/v1/object/channel-clips/${uploadPath}`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cHNjd3RpY2F2cXV0YnpycmpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDEwMTEsImV4cCI6MjA5NTc3NzAxMX0.wHXV1IFLk7UbRWOrJWZN-sjsw8Kau0Rn6OKs29debKo',
      'x-upsert': 'true',
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Upload failed (${response.status}): ${body}`);
  }

  const { data: { publicUrl } } = supabase.storage.from('channel-clips').getPublicUrl(uploadPath);
  return publicUrl;
}

interface ChannelClipParams {
  channelId: string;
  userId: string;
  filePath: string;
  duration: number;
  parentPostId?: string;
  recordedWithHeadphones?: boolean;
  // Replay layer for this clip (e.g. a captured AR face-lens track) → channel_posts.overlay_recipe.
  overlayRecipe?: OverlayRecipe | null;
}

/**
 * Fast "commit" half of posting a channel clip: insert the row and move the
 * recording into the local channel-clips dir keyed by the new post id. After
 * this resolves the clip is immediately playable on THIS device (hasLocalClip
 * is true) — so callers can navigate back and the clip shows as watchable right
 * away, while uploadChannelClipRelay() runs the slow upload in the background.
 */
export async function commitChannelClip({
  channelId, userId, filePath, duration, parentPostId, recordedWithHeadphones = false, overlayRecipe,
}: ChannelClipParams): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .insert({
      channel_id: channelId,
      poster_id: userId,
      post_type: 'clip',
      video_url: null,
      storage_mode: 'cloud',
      duration: Math.round(duration),
      recorded_with_headphones: recordedWithHeadphones,
      ...(parentPostId ? { parent_post_id: parentPostId } : {}),
      ...(overlayRecipe ? { overlay_recipe: overlayRecipe } : {}),
    })
    .select('id')
    .single();
  if (error) { throw error; }
  const postId = data.id as string;

  // Keep a local copy for instant playback on this device (before the upload).
  // WatchChannelClipScreen / ChannelPostScreen use localPathForClip(postId).
  const dir = `${RNFS.DocumentDirectoryPath}/channel-clips`;
  if (!(await RNFS.exists(dir))) { await RNFS.mkdir(dir); }
  await RNFS.moveFile(filePath.replace(/^file:\/\//, ''), `${dir}/${postId}.mp4`);

  return postId;
}

/** Background "upload" half: push the local copy to the channel-clips bucket so
 *  other members can download it, then fill in the row's video_url. */
export async function uploadChannelClipRelay(postId: string, userId: string): Promise<void> {
  const localPath = `${RNFS.DocumentDirectoryPath}/channel-clips/${postId}.mp4`;
  const cloudUrl = await uploadClipToCloud(localPath, `${userId}/${postId}.mp4`);
  await (supabase as any).from('channel_posts').update({ video_url: cloudUrl }).eq('id', postId);
}

/** One-shot post (commit + upload). Kept for any non-interactive callers; the
 *  record screens use commit + a backgrounded relay so playback is instant. */
export async function postChannelClip(params: ChannelClipParams): Promise<string> {
  const postId = await commitChannelClip(params);
  try {
    await uploadChannelClipRelay(postId, params.userId);
  } catch (e) {
    log.error('[postChannelClip] cloud upload failed:', JSON.stringify(e));
  }
  return postId;
}

/** Recover an older local-only clip: if this device has the file but the row has
 *  no cloud URL, upload it so other devices can download it. No-op otherwise. */
export async function backfillChannelClipUpload(
  postId: string,
  userId: string,
  localPath: string,
): Promise<void> {
  const cloudUrl = await uploadClipToCloud(localPath, `${userId}/${postId}.mp4`);
  await (supabase as any)
    .from('channel_posts')
    .update({ video_url: cloudUrl, storage_mode: 'cloud' })
    .eq('id', postId);
}

export async function postChannelAudio({
  channelId, userId, filePath, duration,
}: { channelId: string; userId: string; filePath: string; duration: number }): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .insert({ channel_id: channelId, poster_id: userId, post_type: 'audio',
              video_url: null, storage_mode: 'local', duration: Math.round(duration) })
    .select('id').single();
  if (error) { throw error; }
  const postId = data.id as string;
  const dir = `${RNFS.DocumentDirectoryPath}/channel-clips`;
  if (!(await RNFS.exists(dir))) { await RNFS.mkdir(dir); }
  await RNFS.moveFile(filePath.replace(/^file:\/\//, ''), `${dir}/${postId}.m4a`);
  return postId;
}

export async function deleteChannelPost(postId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('channel_posts').delete().eq('id', postId);
  if (error) { throw error; }
}

export async function addMemberToChannel(channelId: string, userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .rpc('add_member_to_channel', { channel_id: channelId, new_user_id: userId });
  if (error) { throw error; }
}

export async function removeChannelPostEmojiReaction(
  postId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('channel_post_emoji_reactions')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', userId)
    .eq('emoji', emoji);
  if (error) { throw error; }
}

// ── Reviews ("Side B") ──────────────────────────────────────────────────────

async function uploadReviewToCloud(localPath: string, uploadPath: string): Promise<string> {
  if (R2_ENABLED) { return uploadToR2('reviews', uploadPath, localPath); }

  const fileUri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) { throw new Error('Not authenticated'); }

  const formData = new FormData();
  (formData as any).append('file', { uri: fileUri, type: 'video/mp4', name: 'video.mp4' });

  const uploadUrl = `https://ltpscwticavqutbzrrjb.supabase.co/storage/v1/object/reviews/${uploadPath}`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cHNjd3RpY2F2cXV0YnpycmpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDEwMTEsImV4cCI6MjA5NTc3NzAxMX0.wHXV1IFLk7UbRWOrJWZN-sjsw8Kau0Rn6OKs29debKo',
      'x-upsert': 'true',
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Upload failed (${response.status}): ${body}`);
  }

  const { data: { publicUrl } } = supabase.storage.from('reviews').getPublicUrl(uploadPath);
  return publicUrl;
}

/** Submit a review clip for a source post. Always cloud-uploaded so the creator
 *  can watch it even when the reviewer is offline. Keeps a local copy too so the
 *  reviewer's own playback is instant. Returns the review id. */
export async function postReview({
  channelId, postId, reviewerId, filePath, duration,
}: {
  channelId: string;
  postId: string;
  reviewerId: string;
  filePath: string;
  duration: number;
}): Promise<string> {
  // Insert first to get a stable id (video_url set after upload).
  const { data, error } = await (supabase as any)
    .from('channel_reviews')
    .insert({
      channel_id: channelId,
      post_id: postId,
      reviewer_id: reviewerId,
      video_url: null,
      storage_mode: 'cloud',
      duration: Math.round(duration),
    })
    .select('id')
    .single();
  if (error) { throw error; }
  const reviewId = data.id as string;

  // Upload to the reviews bucket: reviews/<reviewerId>/<postId>/<reviewId>.mp4
  const uploadPath = `${reviewerId}/${postId}/${reviewId}.mp4`;
  const cloudUrl = await uploadReviewToCloud(filePath, uploadPath);
  await (supabase as any).from('channel_reviews').update({ video_url: cloudUrl }).eq('id', reviewId);

  // Cache locally (channel-clips dir, keyed by review id) for instant replay.
  try {
    const dir = `${RNFS.DocumentDirectoryPath}/channel-clips`;
    if (!(await RNFS.exists(dir))) { await RNFS.mkdir(dir); }
    await RNFS.moveFile(filePath.replace(/^file:\/\//, ''), `${dir}/${reviewId}.mp4`);
  } catch { /* local cache is best-effort */ }

  return reviewId;
}

function mapReview(r: any): ChannelReview {
  return {
    id: r.id,
    channel_id: r.channel_id,
    post_id: r.post_id,
    reviewer_id: r.reviewer_id,
    reviewer: r.reviewer ?? null,
    video_url: r.video_url ?? null,
    duration: r.duration ?? null,
    view_count: r.view_count ?? 0,
    created_at: r.created_at,
    post_yt_video_id: r.post?.yt_video_id ?? null,
    post_yt_video_title: r.post?.yt_video_title ?? null,
    post_yt_video_thumbnail: r.post?.yt_video_thumbnail ?? null,
    post_source_type: r.post?.source_type ?? 'youtube',
    channel_name: r.channel?.name ?? null,
  };
}

/** Reviews on a single source post (visibility gated by RLS). */
export async function fetchPostReviews(postId: string): Promise<ChannelReview[]> {
  if (DEMO_MODE) { return []; }
  const { data, error } = await (supabase as any)
    .from('channel_reviews')
    .select(`
      id, channel_id, post_id, reviewer_id, video_url, duration, view_count, created_at,
      reviewer:users!reviewer_id(handle)
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: false });
  if (error) { throw error; }
  const blocked = await viewerBlockedIds();
  return (data ?? []).filter((r: any) => !blocked.has(r.reviewer_id)).map(mapReview);
}

/** Every review across a channel, newest first — the creator's inbox. RLS limits
 *  non-creators to their own rows, so this doubles as a "my reviews" list. */
export async function fetchChannelReviews(channelId: string): Promise<ChannelReview[]> {
  const { data, error } = await (supabase as any)
    .from('channel_reviews')
    .select(`
      id, channel_id, post_id, reviewer_id, video_url, duration, view_count, created_at,
      reviewer:users!reviewer_id(handle),
      post:channel_posts!post_id(yt_video_id, yt_video_title, yt_video_thumbnail, source_type)
    `)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false });
  if (error) { throw error; }
  const blocked = await viewerBlockedIds();
  return (data ?? []).filter((r: any) => !blocked.has(r.reviewer_id)).map(mapReview);
}

/** Every channel-clip reaction the user has recorded, across all channels, newest
 *  first. Mirrors fetchMyReviews — powers the channel half of "My Reactions". */
export async function fetchMyChannelReactions(userId: string): Promise<MyChannelReaction[]> {
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .select(`
      id, channel_id, duration, created_at,
      parent:channel_posts!parent_post_id(yt_video_id, yt_video_title, yt_video_thumbnail, source_type),
      channel:groups!channel_id(name)
    `)
    .eq('poster_id', userId)
    .not('parent_post_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) { throw error; }
  return (data ?? []).map((r: any): MyChannelReaction => ({
    id: r.id,
    channel_id: r.channel_id,
    created_at: r.created_at,
    duration: r.duration ?? null,
    channel_name: r.channel?.name ?? null,
    parent_yt_video_id: r.parent?.yt_video_id ?? null,
    parent_yt_video_title: r.parent?.yt_video_title ?? null,
    parent_yt_video_thumbnail: r.parent?.yt_video_thumbnail ?? null,
    parent_source_type: r.parent?.source_type ?? 'youtube',
  }));
}

/** Every review the user has submitted, across all channels, newest first. */
export async function fetchMyReviews(userId: string): Promise<ChannelReview[]> {
  const { data, error } = await (supabase as any)
    .from('channel_reviews')
    .select(`
      id, channel_id, post_id, reviewer_id, video_url, duration, view_count, created_at,
      reviewer:users!reviewer_id(handle),
      post:channel_posts!post_id(yt_video_id, yt_video_title, yt_video_thumbnail, source_type),
      channel:groups!channel_id(name)
    `)
    .eq('reviewer_id', userId)
    .order('created_at', { ascending: false });
  if (error) { throw error; }
  return (data ?? []).map(mapReview);
}

export async function fetchChannelReview(reviewId: string): Promise<ChannelReview | null> {
  const { data, error } = await (supabase as any)
    .from('channel_reviews')
    .select(`
      id, channel_id, post_id, reviewer_id, video_url, duration, view_count, created_at,
      reviewer:users!reviewer_id(handle, avatar_url),
      post:channel_posts!post_id(yt_video_id, yt_video_title, yt_video_thumbnail, source_type)
    `)
    .eq('id', reviewId)
    .single();
  if (error) { return null; }
  return mapReview(data);
}

/** Whether the current user has already reviewed a given post. */
export async function hasReviewedPost(postId: string, userId: string): Promise<boolean> {
  const { data } = await (supabase as any)
    .from('channel_reviews')
    .select('id')
    .eq('post_id', postId)
    .eq('reviewer_id', userId)
    .maybeSingle();
  return !!data;
}

/** Channel settings + owner, for gating tabs/pills/inbox and invite-only access. */
export async function fetchChannelReviewSettings(
  channelId: string,
): Promise<{ reviewsAllowed: boolean; reviewsEnabled: boolean; inviteOnly: boolean; isListed: boolean; ownerId: string | null }> {
  if (DEMO_MODE) { return { reviewsAllowed: true, reviewsEnabled: true, inviteOnly: false, isListed: true, ownerId: 'demo-u-13' }; }
  const { data } = await (supabase as any)
    .from('groups')
    .select('reviews_allowed, reviews_enabled, invite_only, is_public, created_by')
    .eq('id', channelId)
    .single();
  return {
    reviewsAllowed: data?.reviews_allowed ?? true,
    reviewsEnabled: !!data?.reviews_enabled,
    inviteOnly: !!data?.invite_only,
    isListed: !!data?.is_public,
    ownerId: data?.created_by ?? null,
  };
}

export async function setChannelInviteOnly(channelId: string, inviteOnly: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from('groups').update({ invite_only: inviteOnly }).eq('id', channelId);
  if (error) { throw error; }
}

/** Public visibility — whether the channel is listed/discoverable on the Channels screen. */
export async function setChannelPublic(channelId: string, isPublic: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from('groups').update({ is_public: isPublic }).eq('id', channelId);
  if (error) { throw error; }
}

export type MyCreatorChannel = {
  id: string;
  title: string;          // groups.name
  inviteOnly: boolean;
  isListed: boolean;      // groups.is_public
};

/** The signed-in creator's own Members Only channel (created on account connect), or null. */
export async function fetchMyCreatorChannel(userId: string): Promise<MyCreatorChannel | null> {
  const { data } = await (supabase as any)
    .from('groups')
    .select('id, name, invite_only, is_public')
    .eq('created_by', userId)
    .eq('is_members_only', true)
    .maybeSingle();
  if (!data) { return null; }
  return {
    id: data.id,
    title: data.name ?? 'Your Channel',
    inviteOnly: !!data.invite_only,
    isListed: !!data.is_public,
  };
}

// ── Channel invites ─────────────────────────────────────────────────────────

export type UserHit = { id: string; handle: string; displayName: string; avatarUrl: string | null };

/** Search users by handle/name for the invite picker. */
export async function searchUsersByHandle(query: string, excludeId?: string): Promise<UserHit[]> {
  const q = query.trim().replace(/^@/, '');
  if (!q) { return []; }
  const { data } = await (supabase as any)
    .from('users')
    .select('id, handle, display_name, avatar_url')
    .or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(20);
  return (data ?? [])
    .filter((u: any) => u.id !== excludeId)
    .map((u: any) => ({ id: u.id, handle: u.handle, displayName: u.display_name ?? u.handle, avatarUrl: u.avatar_url ?? null }));
}

/** Statuses for who's already a member / pending invite on a channel. */
export async function fetchChannelInviteStates(
  channelId: string,
): Promise<Record<string, 'member' | 'pending'>> {
  const [membersRes, invitesRes] = await Promise.all([
    (supabase as any).from('group_members').select('user_id').eq('group_id', channelId),
    (supabase as any).from('channel_invites').select('invitee_id, status').eq('channel_id', channelId).eq('status', 'pending'),
  ]);
  const out: Record<string, 'member' | 'pending'> = {};
  (invitesRes.data ?? []).forEach((i: any) => { out[i.invitee_id] = 'pending'; });
  (membersRes.data ?? []).forEach((m: any) => { out[m.user_id] = 'member'; });
  return out;
}

export async function inviteToChannel(channelId: string, userId: string): Promise<void> {
  const { error } = await (supabase as any).rpc('invite_to_channel', { p_channel_id: channelId, p_user_id: userId });
  if (error) { throw error; }
}

export async function acceptChannelInvite(channelId: string): Promise<void> {
  const { error } = await (supabase as any).rpc('accept_channel_invite', { p_channel_id: channelId });
  if (error) { throw error; }
}

export async function declineChannelInvite(channelId: string): Promise<void> {
  const { error } = await (supabase as any).rpc('decline_channel_invite', { p_channel_id: channelId });
  if (error) { throw error; }
}

export async function setChannelReviewsEnabled(channelId: string, enabled: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from('groups')
    .update({ reviews_enabled: enabled })
    .eq('id', channelId);
  if (error) { throw error; }
}

/** Master switch. Turning reviews off also forces visibility off. */
export async function setChannelReviewsAllowed(channelId: string, allowed: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from('groups')
    .update(allowed ? { reviews_allowed: true } : { reviews_allowed: false, reviews_enabled: false })
    .eq('id', channelId);
  if (error) { throw error; }
}

// The channel title lives in groups.name. The member-name trigger only renames
// pure group chats (is_public=false AND is_members_only=false), so writing name on
// a channel is durable.
export async function setChannelName(channelId: string, name: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('groups')
    .update({ name })
    .eq('id', channelId);
  if (error) { throw error; }
}

/** The channel's display title. */
export async function fetchChannelDisplayName(channelId: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from('groups').select('name').eq('id', channelId).single();
  return data?.name ?? null;
}
