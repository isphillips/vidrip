import { log } from '../../logging/logger';
import { supabase } from '../client';
import { DEMO_MODE } from '../../../demo/demoMode';
import { demoThreads } from '../../../demo/demoData';
import { resolveReactionUri, signReactionUrl } from '../../storage/reactionStorage';
import { ensurePrivateChannel } from './channels';

export type FeedThread = {
  id: string;
  video_id: string | null;            // null for studio_share (original clip, no source video)
  video_title: string | null;
  video_thumbnail: string | null;
  source_type: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | null;
  sender_id: string;
  created_at: string;
  sender: { handle: string; display_name: string } | null;
  my_status: 'pending' | 'seen' | 'reacted' | null; // null = I am the sender
  thread_kind: 'reaction' | 'studio_share';
  reaction_count: number;
  // Entry point for "My Reactions" → opens the reaction viewer directly (my own
  // reaction if present, else the first one) instead of the chat thread.
  my_reaction_id: string | null;
  // Every reaction on this thread (who reacted, when). Lets the Messages list surface a received
  // reaction on MY shares as fresh inbound activity on the reactor's conversation row.
  reactions: { userId: string; at: number }[];
};

export type ThreadDetail = {
  id: string;
  video_id: string | null;            // null for studio_share (original clip, no source video)
  video_title: string | null;
  video_thumbnail: string | null;
  source_type: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | null;
  sender_id: string;
  created_at: string;
  sender: { handle: string; display_name: string } | null;
  my_status: 'pending' | 'seen' | 'reacted' | null;
  // 'reaction' = wraps a source video; 'studio_share' = an original Studio clip shared to friends.
  thread_kind: 'reaction' | 'studio_share';
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
  user: { id?: string; handle: string; display_name: string } | null;
  emoji_reactions: { emoji: string; user_id: string }[];
  yt_video_id: string | null;
  yt_start_offset: number;
  source_type: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'studio';
  recorded_with_headphones?: boolean;
  // Sender intro on the parent thread (plays once before this reaction is watched).
  intro_url?: string | null;
  intro_duration?: number | null;
  // Parent thread sender + kind (set by fetchReactionById). For a studio_share, the source clip is the
  // SENDER's own reaction row, so playback resolves it from the siblings by matching user.id === senderId.
  senderId?: string | null;
  threadKind?: 'reaction' | 'studio_share' | null;
  // Parent thread's poster image (source_type's thumbnail / studio_share cover). Used as the source
  // player's `poster` so a studio clip shows its thumbnail instead of black while it loads.
  threadThumbnail?: string | null;
  // Afterthought "outro" clip — plays after this reaction finishes.
  afterthought_url?: string | null;
  afterthought_duration?: number | null;
  afterthoughtUri?: string | null;   // resolved (signed) playable URI
  // Resolved at fetch time by resolveReactionUri
  resolvedUri: string | null;
  needsDownload: boolean;         // true = cloud URL available but not yet local
};

export async function fetchFeedThreads(userId: string): Promise<FeedThread[]> {
  if (DEMO_MODE) { return demoThreads; }
  // `thread_kind` is newer than the generated DB types — query untyped so the select isn't rejected.
  const { data, error } = await (supabase as any)
    .from('threads')
    .select(`
      id, video_id, video_title, video_thumbnail, source_type, thread_kind, sender_id, created_at,
      sender:users!sender_id(handle, display_name),
      thread_members(user_id, status),
      reactions(id, user_id, created_at)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((t: any) => {
    const myMembership = t.thread_members?.find((m: any) => m.user_id === userId);
    const myReaction = t.reactions?.find((r: any) => r.user_id === userId);
    return {
      id: t.id,
      video_id: t.video_id,
      video_title: t.video_title,
      video_thumbnail: t.video_thumbnail,
      source_type: t.source_type ?? null,
      sender_id: t.sender_id,
      created_at: t.created_at,
      sender: t.sender,
      my_status: myMembership?.status ?? null,
      thread_kind: (t.thread_kind as 'reaction' | 'studio_share') ?? 'reaction',
      reaction_count: t.reactions?.length ?? 0,
      my_reaction_id: myReaction?.id ?? t.reactions?.[0]?.id ?? null,
      reactions: (t.reactions ?? []).map((r: any) => ({
        userId: r.user_id, at: r.created_at ? Date.parse(r.created_at) || 0 : 0,
      })),
    };
  });
}

// One of MY friend-share reactions, sourced from the reactions table (the source of truth) rather
// than derived from thread membership — so it includes reactions to my own shares and is keyed by the
// actual reaction. Joined to the parent thread for the video metadata + sender + total reaction count.
export type MyReaction = {
  id: string;                 // reaction id (open the reaction viewer)
  thread_id: string | null;   // parent thread (chat fallback / hide key)
  sender_id: string | null;   // parent thread's sender (block filtering)
  created_at: string;
  video_id: string | null;
  video_title: string | null;
  video_thumbnail: string | null;
  source_type: 'youtube' | 'tiktok' | 'instagram' | 'facebook';
  sender: { handle: string; display_name: string } | null;
  reaction_count: number;     // total reactions on the parent thread
};

export async function fetchMyReactions(userId: string): Promise<MyReaction[]> {
  const { data, error } = await supabase
    .from('reactions')
    .select(`
      id, thread_id, created_at, yt_video_id, source_type,
      thread:threads!thread_id(
        video_id, video_title, video_thumbnail, source_type, sender_id,
        sender:users!sender_id(handle, display_name),
        reactions(id)
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) { throw error; }

  return (data ?? []).map((r: any) => {
    const t = r.thread;
    return {
      id: r.id,
      thread_id: r.thread_id ?? null,
      sender_id: t?.sender_id ?? null,
      created_at: r.created_at,
      video_id: t?.video_id ?? r.yt_video_id ?? null,
      video_title: t?.video_title ?? null,
      video_thumbnail: t?.video_thumbnail ?? null,
      source_type: t?.source_type ?? r.source_type ?? 'youtube',
      sender: t?.sender ?? null,
      reaction_count: t?.reactions?.length ?? 0,
    };
  });
}

export async function fetchThread(threadId: string, userId: string): Promise<ThreadDetail | null> {
  // `thread_kind` is newer than the generated DB types — query untyped so the select isn't rejected.
  const { data, error } = await (supabase as any)
    .from('threads')
    .select(`
      id, video_id, video_title, video_thumbnail, source_type, thread_kind, sender_id, created_at, intro_url, intro_duration,
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
    source_type: (data as any).source_type ?? null,
    sender_id: data.sender_id,
    created_at: data.created_at,
    sender: (data as any).sender,
    my_status: myMembership?.status ?? null,
    thread_kind: ((data as any).thread_kind as 'reaction' | 'studio_share') ?? 'reaction',
    intro_url: (data as any).intro_url ?? null,
    intro_duration: (data as any).intro_duration ?? null,
  };
}

// One video share in a 1:1 conversation, in EITHER direction. `direction` is from the viewer's POV;
// `reacted`/`reactedAt` describe the RECIPIENT's reaction (theirs → my reaction; mine → the friend's),
// so the conversation can sink reacted shares to the bottom ordered by reaction time.
export type ConversationShare = {
  id: string;
  direction: 'mine' | 'theirs';
  video_id: string | null;
  video_title: string | null;
  video_thumbnail: string | null;
  source_type: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | null;
  thread_kind: 'reaction' | 'studio_share';
  sentAt: number;     // created_at (ms)
  reacted: boolean;   // did the recipient record a reaction?
  reactedAt: number;  // recipient's reaction created_at (ms), 0 if none
};

const convMs = (iso?: string | null) => (iso ? Date.parse(iso) || 0 : 0);

// All video shares between me and one friend, BOTH directions. RLS scopes `threads` to ones I can see
// (mine as sender, or where I'm a member), so we fetch shares sent by either of us and keep the ones
// that actually involve both. Embeds thread_members(status) + reactions(user_id, created_at) so the
// recipient's reaction state + time come back in one round-trip.
export async function fetchConversationShares(myId: string, friendUserId: string): Promise<ConversationShare[]> {
  // Primary path: a SECURITY DEFINER RPC returns BOTH directions. A direct table read can't see my
  // OUTBOUND threads (threads RLS only exposes threads I'm a member of, and the sender isn't a member
  // of their own thread), so without the RPC the screen only shows what the friend sent me. Falls back
  // to that inbound-only read if the RPC isn't deployed yet, so the conversation never goes blank.
  try {
    const { data, error } = await (supabase as any).rpc('conversation_shares', { p_friend: friendUserId });
    if (error) { throw error; }
    return (data ?? []).map((r: any): ConversationShare => ({
      id: r.id,
      direction: r.direction === 'mine' ? 'mine' : 'theirs',
      video_id: r.video_id ?? null,
      video_title: r.video_title ?? null,
      video_thumbnail: r.video_thumbnail ?? null,
      source_type: r.source_type ?? null,
      thread_kind: (r.thread_kind as 'reaction' | 'studio_share') ?? 'reaction',
      sentAt: convMs(r.sent_at),
      reacted: !!r.reacted,
      reactedAt: r.reacted_at ? convMs(r.reacted_at) : 0,
    }));
  } catch {
    return conversationSharesFromTable(myId, friendUserId);
  }
}

// Inbound-only fallback via a direct table read (RLS hides my outbound threads). Used until the
// conversation_shares RPC is deployed.
async function conversationSharesFromTable(myId: string, friendUserId: string): Promise<ConversationShare[]> {
  const { data, error } = await (supabase as any)
    .from('threads')
    .select(`
      id, video_id, video_title, video_thumbnail, source_type, thread_kind, sender_id, created_at,
      thread_members(user_id, status),
      reactions(user_id, created_at)
    `)
    .or(`sender_id.eq.${myId},sender_id.eq.${friendUserId}`)
    .order('created_at', { ascending: true });
  if (error) { throw error; }

  return (data ?? [])
    .filter((t: any) => {
      const ids = new Set<string>([t.sender_id, ...((t.thread_members ?? []).map((m: any) => m.user_id))]);
      return ids.has(myId) && ids.has(friendUserId);   // a genuine 1:1 between us
    })
    .map((t: any): ConversationShare => {
      const mine = t.sender_id === myId;
      const recipientId = mine ? friendUserId : myId;
      const recipMember = (t.thread_members ?? []).find((m: any) => m.user_id === recipientId);
      const recipReaction = (t.reactions ?? []).find((r: any) => r.user_id === recipientId);
      return {
        id: t.id,
        direction: mine ? 'mine' : 'theirs',
        video_id: t.video_id,
        video_title: t.video_title,
        video_thumbnail: t.video_thumbnail ?? null,
        source_type: t.source_type ?? null,
        thread_kind: (t.thread_kind as 'reaction' | 'studio_share') ?? 'reaction',
        sentAt: convMs(t.created_at),
        reacted: recipMember?.status === 'reacted' || !!recipReaction,
        reactedAt: recipReaction?.created_at ? convMs(recipReaction.created_at) : 0,
      };
    });
}

// The OTHER participant in a 1:1 thread (everyone but me) + their profile — used to route a
// reaction push notification (which carries only thread_id) to the friend CONVERSATION rather than
// the bare Thread screen. Two small queries so we don't depend on a thread_members→users FK name.
export async function fetchThreadCounterpart(
  threadId: string, myId: string,
): Promise<{ friendUserId: string; displayName: string; handle: string; avatarUrl: string | null } | null> {
  const { data: t } = await (supabase as any)
    .from('threads')
    .select('sender_id, thread_members(user_id)')
    .eq('id', threadId)
    .single();
  if (!t) { return null; }
  const ids = new Set<string>([t.sender_id, ...((t.thread_members ?? []).map((m: any) => m.user_id))]);
  ids.delete(myId);
  const friendId = [...ids][0];
  if (!friendId) { return null; }
  const { data: u } = await (supabase as any)
    .from('users')
    .select('id, handle, display_name, avatar_url')
    .eq('id', friendId)
    .single();
  return {
    friendUserId: friendId,
    displayName: u?.display_name ?? '',
    handle: u?.handle ?? '',
    avatarUrl: u?.avatar_url ?? null,
  };
}

// Quick emoji reactions on SHARES (threads). Fetched SEPARATELY from fetchThread (not as an embedded
// join) so a thread still loads if the thread_emoji_reactions table isn't deployed yet — the query just
// returns nothing. Batched by thread id → map.
export async function fetchThreadEmojiReactions(
  threadIds: string[],
): Promise<Map<string, { emoji: string; user_id: string }[]>> {
  const map = new Map<string, { emoji: string; user_id: string }[]>();
  if (threadIds.length === 0) { return map; }
  try {
    const { data, error } = await (supabase as any)
      .from('thread_emoji_reactions')
      .select('thread_id, emoji, user_id')
      .in('thread_id', threadIds);
    if (error || !data) { return map; }
    for (const r of data) {
      if (!map.has(r.thread_id)) { map.set(r.thread_id, []); }
      map.get(r.thread_id)!.push({ emoji: r.emoji, user_id: r.user_id });
    }
  } catch { /* table not deployed yet → no reactions, shares still load */ }
  return map;
}

// Toggle a quick emoji reaction on a SHARE (thread). Scoped by RLS to thread members; idempotent via the
// unique (thread_id, user_id, emoji) constraint.
export async function addThreadEmojiReaction(threadId: string, userId: string, emoji: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('thread_emoji_reactions')
    .upsert({ thread_id: threadId, user_id: userId, emoji }, { onConflict: 'thread_id,user_id,emoji' });
  if (error) { throw error; }
}

// The reaction's recorded emoji-throw track ({e,t}[]). Fetched separately + error-swallowed so a
// missing `emoji_track` column (pre-deploy) degrades to "no throws" rather than breaking the reaction.
export async function fetchReactionEmojiTrack(reactionId: string): Promise<{ e: string; t: number }[]> {
  try {
    const { data, error } = await (supabase as any)
      .from('reactions').select('emoji_track').eq('id', reactionId).single();
    const track = (data as any)?.emoji_track;
    if (error || !Array.isArray(track)) { return []; }
    return track;
  } catch { return []; }
}

export async function removeThreadEmojiReaction(threadId: string, userId: string, emoji: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('thread_emoji_reactions')
    .delete()
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .eq('emoji', emoji);
  if (error) { throw error; }
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
      user:users!user_id(id, handle, display_name),
      emoji_reactions(emoji, user_id),
      thread:threads!thread_id(intro_url, intro_duration, sender_id, thread_kind, video_thumbnail)
    `)
    .eq('id', reactionId)
    .single();

  if (error || !data) return null;
  const item = await hydrateReaction(data);
  return {
    ...item,
    intro_url: (data as any).thread?.intro_url ?? null,
    intro_duration: (data as any).thread?.intro_duration ?? null,
    // Thread sender + kind — for a studio_share, the source clip is the SENDER's own reaction row, so
    // playback finds it among the siblings (see WatchReactionScreen's studio PIP).
    senderId: (data as any).thread?.sender_id ?? null,
    threadKind: ((data as any).thread?.thread_kind as 'reaction' | 'studio_share') ?? null,
    threadThumbnail: (data as any).thread?.video_thumbnail ?? null,
  };
}

export async function fetchReactions(threadId: string): Promise<ReactionItem[]> {
  const { data, error } = await supabase
    .from('reactions')
    .select(`
      id, video_url, storage_mode, duration, created_at, yt_video_id, yt_start_offset, source_type, recorded_with_headphones,
      afterthought_url, afterthought_duration,
      user:users!user_id(id, handle, display_name),
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
    log.error('[fetchAlreadySentRecipients] rpc error:', JSON.stringify(error));
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
  sourceType: 'youtube' | 'tiktok' | 'instagram' | 'facebook' = 'youtube',
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
