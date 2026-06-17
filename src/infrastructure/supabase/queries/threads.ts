import { supabase } from '../client';
import { resolveReactionUri, signReactionUrl } from '../../storage/reactionStorage';
import { ensurePrivateChannel } from './channels';

export type FeedThread = {
  id: string;
  video_id: string;
  video_title: string | null;
  video_thumbnail: string | null;
  source_type: 'youtube' | 'tiktok' | 'instagram';
  sender_id: string;
  created_at: string;
  sender: { handle: string; display_name: string } | null;
  my_status: 'pending' | 'seen' | 'reacted' | null; // null = I am the sender
  reaction_count: number;
};

export type ThreadDetail = {
  id: string;
  video_id: string;
  video_title: string | null;
  video_thumbnail: string | null;
  source_type: 'youtube' | 'tiktok' | 'instagram';
  sender_id: string;
  created_at: string;
  sender: { handle: string; display_name: string } | null;
  my_status: 'pending' | 'seen' | 'reacted' | null;
  // Sender intro attached to this share (plays before the source video / reactions).
  intro_url: string | null;
  intro_duration: number | null;
};

export type ReactionItem = {
  id: string;
  thread_id?: string;
  video_url: string | null;
  storage_mode: 'local' | 'cloud' | 'deleted';
  duration: number;
  created_at: string;
  user: { handle: string; display_name: string } | null;
  emoji_reactions: { emoji: string; user_id: string }[];
  yt_video_id: string | null;
  yt_start_offset: number;
  source_type: 'youtube' | 'tiktok' | 'instagram';
  recorded_with_headphones?: boolean;
  // Sender intro on the parent thread (plays once before this reaction is watched).
  intro_url?: string | null;
  intro_duration?: number | null;
  // Afterthought "outro" clip — plays after this reaction finishes.
  afterthought_url?: string | null;
  afterthought_duration?: number | null;
  afterthoughtUri?: string | null;   // resolved (signed) playable URI
  // Resolved at fetch time by resolveReactionUri
  resolvedUri: string | null;
  needsDownload: boolean;         // true = cloud URL available but not yet local
};

export async function fetchFeedThreads(userId: string): Promise<FeedThread[]> {
  const { data, error } = await supabase
    .from('threads')
    .select(`
      id, video_id, video_title, video_thumbnail, source_type, sender_id, created_at,
      sender:users!sender_id(handle, display_name),
      thread_members(user_id, status),
      reactions(id)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((t: any) => {
    const myMembership = t.thread_members?.find((m: any) => m.user_id === userId);
    return {
      id: t.id,
      video_id: t.video_id,
      video_title: t.video_title,
      video_thumbnail: t.video_thumbnail,
      source_type: t.source_type ?? 'youtube',
      sender_id: t.sender_id,
      created_at: t.created_at,
      sender: t.sender,
      my_status: myMembership?.status ?? null,
      reaction_count: t.reactions?.length ?? 0,
    };
  });
}

export async function fetchThread(threadId: string, userId: string): Promise<ThreadDetail | null> {
  const { data, error } = await supabase
    .from('threads')
    .select(`
      id, video_id, video_title, video_thumbnail, source_type, sender_id, created_at, intro_url, intro_duration,
      sender:users!sender_id(handle, display_name),
      thread_members(user_id, status)
    `)
    .eq('id', threadId)
    .single();

  if (error || !data) return null;

  const myMembership = (data as any).thread_members?.find((m: any) => m.user_id === userId);
  return {
    id: data.id,
    video_id: data.video_id,
    video_title: data.video_title,
    video_thumbnail: (data as any).video_thumbnail ?? null,
    source_type: (data as any).source_type ?? 'youtube',
    sender_id: data.sender_id,
    created_at: data.created_at,
    sender: (data as any).sender,
    my_status: myMembership?.status ?? null,
    intro_url: (data as any).intro_url ?? null,
    intro_duration: (data as any).intro_duration ?? null,
  };
}

async function hydrateReaction(raw: any): Promise<ReactionItem> {
  const base: ReactionItem = {
    ...raw,
    video_url: raw.video_url ?? null,
    storage_mode: raw.storage_mode ?? 'cloud',
    yt_video_id: raw.yt_video_id ?? null,
    yt_start_offset: raw.yt_start_offset ?? 0,
    source_type: raw.source_type ?? 'youtube',
    resolvedUri: null,
    needsDownload: false,
  };
  const resolved = await resolveReactionUri(base);
  const afterthoughtUri = raw.afterthought_url ? await signReactionUrl(raw.afterthought_url) : null;
  return {
    ...base,
    afterthought_url: raw.afterthought_url ?? null,
    afterthought_duration: raw.afterthought_duration ?? null,
    afterthoughtUri,
    resolvedUri: resolved?.uri ?? null,
    needsDownload: resolved?.needsDownload ?? false,
  };
}

export async function fetchReactionById(reactionId: string): Promise<ReactionItem | null> {
  const { data, error } = await supabase
    .from('reactions')
    .select(`
      id, thread_id, video_url, storage_mode, duration, created_at, yt_video_id, yt_start_offset, source_type, recorded_with_headphones,
      afterthought_url, afterthought_duration,
      user:users!user_id(handle, display_name),
      emoji_reactions(emoji, user_id),
      thread:threads!thread_id(intro_url, intro_duration)
    `)
    .eq('id', reactionId)
    .single();

  if (error || !data) return null;
  const item = await hydrateReaction(data);
  return {
    ...item,
    intro_url: (data as any).thread?.intro_url ?? null,
    intro_duration: (data as any).thread?.intro_duration ?? null,
  };
}

export async function fetchReactions(threadId: string): Promise<ReactionItem[]> {
  const { data, error } = await supabase
    .from('reactions')
    .select(`
      id, video_url, storage_mode, duration, created_at, yt_video_id, yt_start_offset, source_type, recorded_with_headphones,
      afterthought_url, afterthought_duration,
      user:users!user_id(handle, display_name),
      emoji_reactions(emoji, user_id)
    `)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) { throw error; }
  return Promise.all((data ?? []).map(hydrateReaction));
}

export async function markThreadSeen(threadId: string) {
  await supabase
    .from('thread_members')
    .update({ status: 'seen' })
    .eq('thread_id', threadId)
    .eq('status', 'pending');
}

// Returns user IDs who have already been sent this video by this sender.
export async function fetchAlreadySentRecipients(
  senderId: string,
  videoId: string,
): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .rpc('get_thread_recipients', { p_sender_id: senderId, p_video_id: videoId });

  if (error) {
    console.error('[fetchAlreadySentRecipients] rpc error:', JSON.stringify(error));
    return [];
  }
  return (data ?? []) as string[];
}

/** Attach (or replace) a sender intro on a thread after the clip is uploaded. */
export async function updateThreadIntro(
  threadId: string,
  introUrl: string,
  introDuration: number,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('threads')
    .update({ intro_url: introUrl, intro_duration: Math.round(introDuration) })
    .eq('id', threadId);
  if (error) { throw error; }
}

export async function sendThread(
  senderId: string,
  videoId: string,
  videoTitle: string,
  videoThumbnail: string,
  recipientIds: string[],
  sourceType: 'youtube' | 'tiktok' | 'instagram' = 'youtube',
  // Runs after the thread row exists but BEFORE recipients are added (and thus
  // before the share push fires). Used to attach an intro; if it throws, no
  // recipient is notified and the send fails cleanly.
  onThreadReady?: (threadId: string) => Promise<void>,
): Promise<{ threadId: string; alreadySentTo: string[] }> {
  // Find or create the thread for this (sender, video) pair — stacking behaviour.
  // Use limit(1) + order so legacy duplicates don't break the lookup.
  const { data: existingRows } = await supabase
    .from('threads')
    .select('id')
    .eq('sender_id', senderId)
    .eq('video_id', videoId)
    .order('created_at', { ascending: true })
    .limit(1);
  const existing = existingRows?.[0] ?? null;

  let threadId: string;
  let alreadySentTo: string[] = [];
  let newRecipients = recipientIds;

  if (existing) {
    threadId = existing.id;

    // Determine which of the requested recipients are already in this thread.
    const { data: existingMembers } = await supabase
      .from('thread_members')
      .select('user_id')
      .eq('thread_id', threadId)
      .in('user_id', recipientIds);

    const alreadySet = new Set((existingMembers ?? []).map((m: any) => m.user_id as string));
    alreadySentTo = [...alreadySet];
    newRecipients = recipientIds.filter(id => !alreadySet.has(id));
  } else {
    const { data: thread, error: threadError } = await supabase
      .from('threads')
      .insert({ video_id: videoId, video_title: videoTitle, video_thumbnail: videoThumbnail, source_type: sourceType, sender_id: senderId })
      .select('id')
      .single();

    if (threadError || !thread) { throw threadError ?? new Error('Failed to create thread'); }
    threadId = thread.id;
  }

  // Attach the intro (or any pre-notify work) before recipients are added, so a
  // failure here can't leave a notified-but-broken share.
  if (onThreadReady) { await onThreadReady(threadId); }

  if (newRecipients.length > 0) {
    const { error } = await supabase
      .from('thread_members')
      .insert(newRecipients.map(userId => ({ thread_id: threadId, user_id: userId, status: 'pending' })));
    if (error) { throw error; }
  }

  // Ensure private channels exist for each new pair — fire-and-forget.
  recipientIds.forEach(recipientId => {
    ensurePrivateChannel(senderId, recipientId).catch(() => {});
  });

  return { threadId, alreadySentTo };
}
