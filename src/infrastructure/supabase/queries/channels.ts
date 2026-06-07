import RNFS from 'react-native-fs';
import { supabase } from '../client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChannelSummary = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_by: string;
  owner: { handle: string } | null;
  pinned_video_id: string | null;
  pinned_video_title: string | null;
  pinned_video_thumbnail: string | null;
  member_count: number;
  is_joined: boolean;
  unread_count: number;
  last_message_at: string | null;
  is_members_only?: boolean;
  avatar_url?: string | null;
};

export type ChannelPost = {
  id: string;
  channel_id: string;
  poster_id: string;
  poster: { handle: string } | null;
  post_type: 'youtube' | 'clip' | 'audio' | 'status';
  source_type: 'youtube' | 'tiktok';
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
  parent_post_id: string | null;
  parent_yt_video_id: string | null;
  parent_source_type: 'youtube' | 'tiktok';
};

// ── Queries ───────────────────────────────────────────────────────────────────

export async function fetchPublicChannels(userId: string): Promise<ChannelSummary[]> {
  const [channelsResult, membershipsResult] = await Promise.all([
    (supabase as any)
      .from('groups')
      .select(`
        id, name, description, is_public, created_by, member_count,
        pinned_video_id, pinned_video_title, pinned_video_thumbnail,
        owner:users!created_by(handle)
      `)
      .eq('is_public', true)
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
        .select('id, channel_id')
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
      if (!reacted.has(p.id)) {
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
  const [channelsResult, membershipsResult] = await Promise.all([
    (supabase as any)
      .from('groups')
      .select(`
        id, name, description, is_public, created_by, member_count, avatar_url,
        pinned_video_id, pinned_video_title, pinned_video_thumbnail,
        owner:users!created_by(handle)
      `)
      .eq('is_members_only', true)
      .eq('is_hidden', false)
      .order('member_count', { ascending: false }),
    (supabase as any).from('group_members').select('group_id').eq('user_id', userId),
  ]);
  if (channelsResult.error) { throw channelsResult.error; }

  const joinedIds = new Set<string>((membershipsResult.data ?? []).map((m: any) => m.group_id));

  // Unreacted source posts per joined channel → home-screen dot.
  const unreactedByChannel = new Map<string, number>();
  const joinedList = [...joinedIds];
  if (joinedList.length) {
    const [postsRes, mineRes] = await Promise.all([
      (supabase as any).from('channel_posts')
        .select('id, channel_id').in('channel_id', joinedList)
        .eq('post_type', 'youtube').is('parent_post_id', null),
      (supabase as any).from('channel_posts')
        .select('parent_post_id').eq('poster_id', userId).not('parent_post_id', 'is', null),
    ]);
    const reacted = new Set<string>((mineRes.data ?? []).map((r: any) => r.parent_post_id));
    (postsRes.data ?? []).forEach((p: any) => {
      if (!reacted.has(p.id)) {
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
    avatar_url: c.avatar_url ?? null,
  }));
}

export type MembersOnlyVideo = {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  sourceType: 'youtube' | 'tiktok';
  createdAt: string;   // recency axis for interleaving into the shorts feed
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
    .select('id, owner:users!created_by(handle)')
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
    .select('channel_id, yt_video_id, yt_video_title, yt_video_thumbnail, source_type, created_at')
    .in('channel_id', ids)
    .eq('post_type', 'youtube')
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
      sourceType: (p.source_type ?? 'youtube') as 'youtube' | 'tiktok',
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
      owner:users!created_by(handle)
    `)
    .eq('is_public', false)
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
    parent_post_id: p.parent_post_id ?? null,
    parent_yt_video_id: null,
    parent_source_type: 'youtube',
  }));
}

export async function fetchChannelPost(postId: string): Promise<ChannelPost | null> {
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .select(`
      id, channel_id, poster_id, post_type, source_type, message,
      yt_video_id, yt_video_title, yt_video_thumbnail,
      video_url, duration, is_pinned, created_at,
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
  sourceType?: 'youtube' | 'tiktok';
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

export async function postChannelClip({
  channelId,
  userId,
  filePath,
  duration,
  parentPostId,
}: {
  channelId: string;
  userId: string;
  filePath: string;
  duration: number;
  parentPostId?: string;
}): Promise<string> {
  // Insert first to get a stable ID — stored locally, not uploaded to cloud.
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .insert({
      channel_id: channelId,
      poster_id: userId,
      post_type: 'clip',
      video_url: null,
      storage_mode: 'local',
      duration: Math.round(duration),
      ...(parentPostId ? { parent_post_id: parentPostId } : {}),
    })
    .select('id')
    .single();

  if (error) { throw error; }
  const postId = data.id as string;

  // Move the temp recording to the permanent local clips dir.
  // WatchChannelClipScreen uses localPathForClip(postId) to find this file.
  const dir = `${RNFS.DocumentDirectoryPath}/channel-clips`;
  if (!(await RNFS.exists(dir))) { await RNFS.mkdir(dir); }
  await RNFS.moveFile(filePath.replace(/^file:\/\//, ''), `${dir}/${postId}.mp4`);

  return postId;
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
