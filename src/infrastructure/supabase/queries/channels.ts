import RNFS from 'react-native-fs';
import { supabase, SUPABASE_ANON_KEY } from '../client';
import type { OverlayRecipe } from '../../../features/studio/effectRecipe';

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
  member_count: number;
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
};

export type ChannelPost = {
  id: string;
  channel_id: string;
  poster_id: string;
  poster: { handle: string } | null;
  post_type: 'youtube' | 'clip' | 'audio' | 'status' | 'creator';
  source_type: 'youtube' | 'tiktok' | 'instagram' | 'bunny';
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
  has_my_reaction: boolean;
  review_count: number;
  has_my_review: boolean;
  parent_post_id: string | null;
  parent_yt_video_id: string | null;
  parent_source_type: 'youtube' | 'tiktok' | 'instagram';
  recorded_with_headphones?: boolean;
};

// A 60s review clip submitted to a creator after reacting. Lives in its own
// table (channel_reviews) so visibility can be gated by groups.reviews_enabled.
export type ChannelReview = {
  id: string;
  channel_id: string;
  post_id: string;
  reviewer_id: string;
  reviewer: { handle: string } | null;
  video_url: string | null;
  duration: number | null;
  created_at: string;
  // Parent source-post context (populated by the inbox / my-reviews queries).
  post_yt_video_id: string | null;
  post_yt_video_title: string | null;
  post_yt_video_thumbnail: string | null;
  post_source_type: 'youtube' | 'tiktok' | 'instagram';
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
  parent_source_type: 'youtube' | 'tiktok' | 'instagram';
};

// ── Queries ───────────────────────────────────────────────────────────────────

export async function fetchPublicChannels(userId: string): Promise<ChannelSummary[]> {
  const [channelsResult, membershipsResult] = await Promise.all([
    (supabase as any)
      .from('groups')
      .select(`
        id, name, description, is_public, created_by, member_count,
        pinned_video_id, pinned_video_title, pinned_video_thumbnail,
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
    member_count: c.member_count ?? 0,
    is_joined: joinedIds.has(c.id),
    unread_count: joinedIds.has(c.id) ? (unreactedByChannel.get(c.id) ?? 0) : 0,
    last_message_at: null,
  }));
}

export async function fetchMembersOnlyChannels(userId: string): Promise<ChannelSummary[]> {
  const [channelsResult, membershipsResult, invitesResult] = await Promise.all([
    (supabase as any)
      .from('groups')
      .select(`
        id, name, description, is_public, created_by, member_count, avatar_url, invite_only, subscriber_mode,
        pinned_video_id, pinned_video_title, pinned_video_thumbnail,
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
    member_count: c.member_count ?? 0,
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
  sourceType: 'youtube' | 'tiktok' | 'instagram';
  videoUrl?: string | null;   // instagram plays from the re-hosted file (no embed)
  createdAt: string;          // recency axis for interleaving into the shorts feed
};

/** Recent source videos from JOINED Members Only channels, for the share browse grid. */
export async function fetchMembersOnlyVideos(userId: string, limit = 30): Promise<MembersOnlyVideo[]> {
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
      id, name, description, is_public, created_by, member_count,
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
    is_joined: true,
    unread_count: unreadMap.get(c.id)?.count ?? 0,
    last_message_at: unreadMap.get(c.id)?.lastMsg ?? null,
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

export async function fetchChannelPosts(channelId: string, userId?: string): Promise<ChannelPost[]> {
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .select(`
      id, channel_id, poster_id, post_type, source_type, message,
      yt_video_id, yt_video_title, yt_video_thumbnail,
      video_url, duration, is_pinned, created_at,
      poster:users!poster_id(handle),
      emoji_reactions:channel_post_emoji_reactions(emoji, user_id),
      reactions:channel_posts!parent_post_id(count)
    `)
    .eq('channel_id', channelId)
    .eq('hidden', false)   // exclude videos from disabled creator accounts
    .is('parent_post_id', null)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

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

  return (data ?? []).map((p: any) => ({
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
    reaction_count: Array.isArray(p.reactions) ? (p.reactions[0]?.count ?? 0) : 0,
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
  return (data ?? []).map((m: any) => ({ userId: m.user_id as string, handle: m.handle as string }));
}

export async function fetchChannelName(channelId: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from('groups').select('name').eq('id', channelId).single();
  return data?.name ?? null;
}

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
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .select(`
      id, channel_id, poster_id, post_type, source_type, message,
      yt_video_id, yt_video_title, yt_video_thumbnail,
      video_url, duration, is_pinned, created_at,
      poster:users!poster_id(handle),
      emoji_reactions:channel_post_emoji_reactions(emoji, user_id)
    `)
    .eq('parent_post_id', parentPostId)
    .order('created_at', { ascending: true });

  if (error) { throw error; }
  return (data ?? []).map((p: any) => ({
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
  created_at: string;
  parent_yt_video_id: string | null;
  parent_yt_video_title: string | null;
  parent_yt_video_thumbnail: string | null;
  parent_source_type: 'youtube' | 'tiktok' | 'instagram';
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

  const reacted = new Set<string>((mineRes.data ?? []).map((r: any) => r.parent_post_id));
  const nameById = new Map<string, string>();
  (groupsRes.data ?? []).forEach((g: any) => {
    const fallback = g.is_members_only && !g.name && g.owner?.handle ? `@${g.owner.handle}` : (g.name ?? '');
    nameById.set(g.id, fallback);
  });

  return (postsRes.data ?? [])
    .filter((p: any) => !reacted.has(p.id) && p.poster_id !== userId)
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
    .select('id, duration, created_at, parent_post_id, poster:users!poster_id(handle)')
    .eq('channel_id', channelId)
    .not('parent_post_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) { throw error; }
  const rows = data ?? [];

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
    created_at: p.created_at,
    parent_yt_video_id: par?.yt_video_id ?? null,
    parent_yt_video_title: par?.yt_video_title ?? null,
    parent_yt_video_thumbnail: par?.yt_video_thumbnail ?? null,
    parent_source_type: par?.source_type ?? 'youtube',
    };
  });
}

export async function fetchChannelPost(postId: string): Promise<ChannelPost | null> {
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .select(`
      id, channel_id, poster_id, post_type, source_type, message,
      yt_video_id, yt_video_title, yt_video_thumbnail,
      video_url, duration, is_pinned, created_at, recorded_with_headphones,
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
export async function fetchSubscribedChannels(userId: string): Promise<ChannelSummary[]> {
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

// The user's own channel subscriptions (for the Account screen). RLS lets a user
// read their own rows.
export type MySubscription = {
  channelId: string; name: string; tierTitle: string | null; status: string;
  currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean;
};
export async function fetchMySubscriptions(userId: string): Promise<MySubscription[]> {
  const { data } = await (supabase as any)
    .from('channel_subscriptions')
    .select('channel_id, status, current_period_end, cancel_at_period_end, channel:groups!channel_id(name), tier:channel_subscription_tiers!tier_id(title)')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due'])
    .order('updated_at', { ascending: false });
  return ((data ?? []) as any[]).map((s) => ({
    channelId: s.channel_id,
    name: s.channel?.name ?? 'Channel',
    tierTitle: s.tier?.title ?? null,
    status: s.status,
    currentPeriodEnd: s.current_period_end ?? null,
    cancelAtPeriodEnd: !!s.cancel_at_period_end,
  }));
}

// Subscription management calls the web API (Stripe lives server-side).
const WEB_API_BASE = 'https://www.vidrip.app/api';

// A valid (non-expired) access token for the cross-service call. getSession() can
// hand back a stale token; refresh if it's missing or about to expire, else the
// web function rejects it as "unauthorized".
async function freshAccessToken(): Promise<string> {
  let session = (await supabase.auth.getSession()).data.session;
  // Only refresh an EXISTING, near-expiry session — refreshSession() throws
  // ("Auth session missing") when there's no session to refresh.
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    try { const r = await supabase.auth.refreshSession(); if (r.data.session) { session = r.data.session; } }
    catch { /* keep the current token */ }
  }
  const token = session?.access_token;
  if (!token) { throw new Error('Please sign in again to manage your subscription.'); }
  return token;
}

async function billingPost(path: string, channelId: string): Promise<void> {
  const token = await freshAccessToken();
  const res = await fetch(`${WEB_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ channelId }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({} as any));
    throw new Error(j.error ?? `Request failed (${res.status})`);
  }
}

// Cancel at period end (user keeps access until then) / un-cancel.
export const cancelChannelSubscription = (channelId: string) => billingPost('/subscribe/cancel', channelId);
export const resumeChannelSubscription = (channelId: string) => billingPost('/subscribe/resume', channelId);

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
): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('channel_post_emoji_reactions')
    .insert({ post_id: postId, user_id: userId, emoji })
    .select('id')
    .single();
  if (error) { throw error; }
  return data.id;
}

async function uploadClipToCloud(localPath: string, uploadPath: string): Promise<string> {
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
    console.error('[postChannelClip] cloud upload failed:', JSON.stringify(e));
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
  const { data, error } = await (supabase as any)
    .from('channel_reviews')
    .select(`
      id, channel_id, post_id, reviewer_id, video_url, duration, created_at,
      reviewer:users!reviewer_id(handle)
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: false });
  if (error) { throw error; }
  return (data ?? []).map(mapReview);
}

/** Every review across a channel, newest first — the creator's inbox. RLS limits
 *  non-creators to their own rows, so this doubles as a "my reviews" list. */
export async function fetchChannelReviews(channelId: string): Promise<ChannelReview[]> {
  const { data, error } = await (supabase as any)
    .from('channel_reviews')
    .select(`
      id, channel_id, post_id, reviewer_id, video_url, duration, created_at,
      reviewer:users!reviewer_id(handle),
      post:channel_posts!post_id(yt_video_id, yt_video_title, yt_video_thumbnail, source_type)
    `)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false });
  if (error) { throw error; }
  return (data ?? []).map(mapReview);
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
      id, channel_id, post_id, reviewer_id, video_url, duration, created_at,
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
      id, channel_id, post_id, reviewer_id, video_url, duration, created_at,
      reviewer:users!reviewer_id(handle),
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
