import { supabase } from '../client';

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
  video_url: string;
  duration: number;
  created_at: string;
  user: { handle: string; display_name: string } | null;
  emoji_reactions: { emoji: string; user_id: string }[];
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

export async function fetchReactionById(reactionId: string): Promise<ReactionItem | null> {
  const { data, error } = await supabase
    .from('reactions')
    .select(`
      id, video_url, duration, created_at,
      user:users!user_id(handle, display_name),
      emoji_reactions(emoji, user_id)
    `)
    .eq('id', reactionId)
    .single();

  if (error || !data) return null;

  // Exchange the stored public URL for a 1-hour signed URL.
  // The reactions bucket is private so the raw public URL returns 403.
  const storedUrl: string = (data as any).video_url ?? '';
  const pathMatch = storedUrl.match(/\/storage\/v1\/object\/(?:public\/)?reactions\/(.+?)(?:\?|$)/);
  if (pathMatch) {
    const { data: signed, error: signErr } = await supabase.storage
      .from('reactions')
      .createSignedUrl(decodeURIComponent(pathMatch[1]), 3600);
    console.log('[fetchReactionById] signedUrl:', signed?.signedUrl ?? 'NONE', 'error:', signErr?.message ?? 'none');
    if (signed?.signedUrl) {
      return { ...(data as unknown as ReactionItem), video_url: signed.signedUrl };
    }
  }
  console.log('[fetchReactionById] falling back to raw url:', storedUrl);

  return data as unknown as ReactionItem;
}

export async function fetchReactions(threadId: string): Promise<ReactionItem[]> {
  const { data, error } = await supabase
    .from('reactions')
    .select(`
      id, video_url, duration, created_at,
      user:users!user_id(handle, display_name),
      emoji_reactions(emoji, user_id)
    `)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ReactionItem[];
}

export async function markThreadSeen(threadId: string) {
  await supabase
    .from('thread_members')
    .update({ status: 'seen' })
    .eq('thread_id', threadId)
    .eq('status', 'pending');
}

export async function sendThread(
  senderId: string,
  videoId: string,
  videoTitle: string,
  videoThumbnail: string,
  recipientIds: string[],
): Promise<string> {
  const { data: thread, error: threadError } = await supabase
    .from('threads')
    .insert({ video_id: videoId, video_title: videoTitle, video_thumbnail: videoThumbnail, sender_id: senderId })
    .select('id')
    .single();

  if (threadError || !thread) throw threadError ?? new Error('Failed to create thread');

  const { error: membersError } = await supabase
    .from('thread_members')
    .insert(recipientIds.map((userId) => ({ thread_id: thread.id, user_id: userId, status: 'pending' })));

  if (membersError) throw membersError;

  return thread.id;
}
