import { supabase } from '../client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VideoComment = {
  id: string;
  root_source_id: string;
  source_type: 'youtube' | 'tiktok' | 'instagram';
  parent_comment_id: string | null;
  author_id: string;
  video_url: string | null;
  duration: number | null;
  reply_count: number;
  emoji_count: number;
  created_at: string;
  author_handle: string;
  author_avatar_url: string | null;
  is_friend: boolean;
  // Client-side: populated when this device recorded the comment and video_url
  // hasn't arrived yet (relay still in-flight).
  local_path?: string;
};

export type CommentCursor = {
  emoji_count: number;
  created_at: string;
  id: string;
};

// ── Fetch ─────────────────────────────────────────────────────────────────────

/** One page of comments for a video or replies to a comment. */
export async function fetchVideoComments(params: {
  rootSourceId: string;
  sourceType: 'youtube' | 'tiktok' | 'instagram';
  parentCommentId?: string | null;
  viewerId?: string | null;
  cursor?: CommentCursor | null;
  limit?: number;
}): Promise<VideoComment[]> {
  const { rootSourceId, sourceType, parentCommentId = null, viewerId = null, cursor = null, limit = 20 } = params;

  const { data, error } = await (supabase as any).rpc('get_video_comments', {
    p_root_source_id:    rootSourceId,
    p_source_type:       sourceType,
    p_parent_comment_id: parentCommentId ?? null,
    p_viewer_id:         viewerId ?? null,
    p_after_emoji:       cursor?.emoji_count ?? null,
    p_after_ts:          cursor?.created_at ?? null,
    p_after_id:          cursor?.id ?? null,
    p_limit:             limit,
  });

  if (error) { throw error; }
  return (data ?? []).map(mapComment);
}

/** Single comment by id — used when navigating to a deep-linked comment. */
export async function fetchVideoComment(commentId: string): Promise<VideoComment | null> {
  const { data, error } = await (supabase as any)
    .from('video_comments')
    .select(`
      id, root_source_id, source_type, parent_comment_id, author_id,
      video_url, duration, reply_count, emoji_count, created_at,
      author:users!author_id(handle, avatar_url)
    `)
    .eq('id', commentId)
    .single();

  if (error) { return null; }
  return mapCommentRow(data);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Insert a new comment row with video_url = null (commit step). Returns the new id. */
export async function postVideoComment(params: {
  rootSourceId: string;
  sourceType: 'youtube' | 'tiktok' | 'instagram';
  parentCommentId?: string | null;
  authorId: string;
  duration: number;
}): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('video_comments')
    .insert({
      root_source_id:    params.rootSourceId,
      source_type:       params.sourceType,
      parent_comment_id: params.parentCommentId ?? null,
      author_id:         params.authorId,
      video_url:         null,
      storage_mode:      'cloud',
      duration:          Math.round(params.duration),
    })
    .select('id')
    .single();

  if (error) { throw error; }
  return data.id as string;
}

/** Set video_url after the relay upload completes. */
export async function updateVideoCommentUrl(commentId: string, videoUrl: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('video_comments')
    .update({ video_url: videoUrl })
    .eq('id', commentId);
  if (error) { throw error; }
}

export async function deleteVideoComment(commentId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('video_comments')
    .delete()
    .eq('id', commentId);
  if (error) { throw error; }
}

// ── Emoji reactions ───────────────────────────────────────────────────────────

export async function addCommentEmoji(commentId: string, userId: string, emoji: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('video_comment_emoji_reactions')
    .insert({ comment_id: commentId, user_id: userId, emoji });
  if (error) { throw error; }
}

export async function removeCommentEmoji(commentId: string, userId: string, emoji: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('video_comment_emoji_reactions')
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', userId)
    .eq('emoji', emoji);
  if (error) { throw error; }
}

/** All emoji reactions on a comment, for the local reaction picker. */
export async function fetchCommentEmojiReactions(
  commentId: string,
): Promise<{ emoji: string; user_id: string }[]> {
  const { data, error } = await (supabase as any)
    .from('video_comment_emoji_reactions')
    .select('emoji, user_id')
    .eq('comment_id', commentId);
  if (error) { throw error; }
  return data ?? [];
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapComment(r: any): VideoComment {
  return {
    id:                r.id,
    root_source_id:    r.root_source_id,
    source_type:       r.source_type,
    parent_comment_id: r.parent_comment_id ?? null,
    author_id:         r.author_id,
    video_url:         r.video_url ?? null,
    duration:          r.duration ?? null,
    reply_count:       r.reply_count ?? 0,
    emoji_count:       r.emoji_count ?? 0,
    created_at:        r.created_at,
    author_handle:     r.author_handle ?? '',
    author_avatar_url: r.author_avatar_url ?? null,
    is_friend:         !!r.is_friend,
  };
}

// Maps a raw channel_posts-style row (author as a nested join) to VideoComment.
function mapCommentRow(r: any): VideoComment {
  return {
    id:                r.id,
    root_source_id:    r.root_source_id,
    source_type:       r.source_type,
    parent_comment_id: r.parent_comment_id ?? null,
    author_id:         r.author_id,
    video_url:         r.video_url ?? null,
    duration:          r.duration ?? null,
    reply_count:       r.reply_count ?? 0,
    emoji_count:       r.emoji_count ?? 0,
    created_at:        r.created_at,
    author_handle:     r.author?.handle ?? '',
    author_avatar_url: r.author?.avatar_url ?? null,
    is_friend:         false,
  };
}
