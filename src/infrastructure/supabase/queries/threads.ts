import { supabase } from '../client';
import { resolveReactionUri } from '../../storage/reactionStorage';
import { ensurePrivateChannel } from './channels';

export type FeedThread = {
  id: string;
  video_id: string;
  video_title: string | null;
  video_thumbnail: string | null;
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
  sender_id: string;
  created_at: string;
  sender: { handle: string; display_name: string } | null;
  my_status: 'pending' | 'seen' | 'reacted' | null;
};

export type ReactionItem = {
  id: string;
  video_url: string | null;       // null for local-mode reactions
  storage_mode: 'local' | 'cloud' | 'deleted';
  duration: number;
  created_at: string;
  user: { handle: string; display_name: string } | null;
  emoji_reactions: { emoji: string; user_id: string }[];
  // Resolved at fetch time by resolveReactionUri
  resolvedUri: string | null;
  needsDownload: boolean;         // true = cloud URL available but not yet local
};

export async function fetchFeedThreads(userId: string): Promise<FeedThread[]> {
  const { data, error } = await supabase
    .from('threads')
    .select(`
      id, video_id, video_title, video_thumbnail, sender_id, created_at,
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
      id, video_id, video_title, sender_id, created_at,
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
    sender_id: data.sender_id,
    created_at: data.created_at,
    sender: (data as any).sender,
    my_status: myMembership?.status ?? null,
  };
}

async function hydrateReaction(raw: any): Promise<ReactionItem> {
  const base: ReactionItem = {
    ...raw,
    video_url: raw.video_url ?? null,
    storage_mode: raw.storage_mode ?? 'cloud',
    resolvedUri: null,
    needsDownload: false,
  };
  const resolved = await resolveReactionUri(base);
  return {
    ...base,
    resolvedUri: resolved?.uri ?? null,
    needsDownload: resolved?.needsDownload ?? false,
  };
}

export async function fetchReactionById(reactionId: string): Promise<ReactionItem | null> {
  const { data, error } = await supabase
    .from('reactions')
    .select(`
      id, video_url, storage_mode, duration, created_at,
      user:users!user_id(handle, display_name),
      emoji_reactions(emoji, user_id)
    `)
    .eq('id', reactionId)
    .single();

  if (error || !data) return null;
  return hydrateReaction(data);
}

export async function fetchReactions(threadId: string): Promise<ReactionItem[]> {
  const { data, error } = await supabase
    .from('reactions')
    .select(`
      id, video_url, storage_mode, duration, created_at,
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

export async function sendThread(
  senderId: string,
  videoId: string,
  videoTitle: string,
  videoThumbnail: string,
  recipientIds: string[],
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
    const newRecipients = recipientIds.filter(id => !alreadySet.has(id));

    if (newRecipients.length > 0) {
      const { error } = await supabase
        .from('thread_members')
        .insert(newRecipients.map(userId => ({ thread_id: threadId, user_id: userId, status: 'pending' })));
      if (error) { throw error; }
    }
  } else {
    const { data: thread, error: threadError } = await supabase
      .from('threads')
      .insert({ video_id: videoId, video_title: videoTitle, video_thumbnail: videoThumbnail, sender_id: senderId })
      .select('id')
      .single();

    if (threadError || !thread) { throw threadError ?? new Error('Failed to create thread'); }
    threadId = thread.id;

    const { error: membersError } = await supabase
      .from('thread_members')
      .insert(recipientIds.map(userId => ({ thread_id: threadId, user_id: userId, status: 'pending' })));
    if (membersError) { throw membersError; }
  }

  // Ensure private channels exist for each new pair — fire-and-forget.
  recipientIds.forEach(recipientId => {
    ensurePrivateChannel(senderId, recipientId).catch(() => {});
  });

  return { threadId, alreadySentTo };
}
