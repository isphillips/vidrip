import RNFS from 'react-native-fs';
import { supabase } from '../supabase/client';
import { uploadToCloud } from '../storage/reactionStorage';
import { ensureReactionsDir, localPathForReaction } from '../storage/localReactionStorage';
import { ensurePrivateChannel } from '../supabase/queries/channels';

// Path A publish — "share with friends" for a Studio clip. Mirrors the reactions friend-share model
// (Supabase `reactions` bucket + p2p download/cache) but the clip is ORIGINAL content, so it rides a
// source-less thread (thread_kind='studio_share', no video_id) with the sender's clip stored as the
// thread's first reaction row. Recipients watch it (and can react, turning it into a normal thread).
//
// Overlay must already be baked into `fileUri` by the caller — recipients play a plain MP4 in the
// reaction viewer, which does not replay an animated overlay recipe.
export async function publishStudioClipToFriends(opts: {
  userId: string;
  fileUri: string;            // baked MP4 (overlay flattened in)
  recipientIds: string[];
  title: string;
  durationSec: number;
  thumbnailUrl?: string | null;
}): Promise<{ threadId: string; reactionId: string }> {
  const { userId, fileUri, recipientIds, title, durationSec, thumbnailUrl } = opts;
  if (recipientIds.length === 0) { throw new Error('Pick at least one friend to share with.'); }

  // 1. Source-less thread — no source video; flagged so feed/thread UIs skip the source player.
  const { data: thread, error: tErr } = await (supabase as any)
    .from('threads')
    .insert({
      sender_id: userId,
      video_id: null,
      video_title: title,
      video_thumbnail: thumbnailUrl ?? null,
      source_type: null,
      thread_kind: 'studio_share',
    })
    .select('id')
    .single();
  if (tErr || !thread) { throw tErr ?? new Error('Failed to create share'); }
  const threadId: string = thread.id;

  // 2. The sender's clip IS the content → store it as the thread's reaction row, then relay-upload.
  //    storage_mode 'cloud' + recorded_with_headphones true keep it on the DURABLE path (the
  //    source-audio TTL that sweeps ephemeral reactions doesn't apply to original content).
  const { data: rx, error: rErr } = await (supabase as any)
    .from('reactions')
    .insert({
      thread_id: threadId,
      user_id: userId,
      video_url: null,
      duration: Math.round(durationSec),
      storage_mode: 'cloud',
      source_type: 'youtube',          // placeholder — no source video (yt_video_id stays null)
      recorded_with_headphones: true,
    })
    .select('id')
    .single();
  if (rErr || !rx) { throw rErr ?? new Error('Failed to create clip'); }
  const reactionId: string = rx.id;

  // 3. Seed the local cache so the sender (and re-opens) play instantly without a download.
  //    Best-effort COPY (not move) so the caller's preview URI stays valid.
  try {
    await ensureReactionsDir();
    const src = fileUri.startsWith('file://') ? fileUri.slice('file://'.length) : fileUri;
    await RNFS.copyFile(src, localPathForReaction(reactionId));
  } catch { /* best-effort */ }

  // 4. Relay-upload to the reactions bucket and link it (recipients download from here).
  const uploadPath = `${userId}/${threadId}/${reactionId}.mp4`;
  const cloudUrl = await uploadToCloud(fileUri, uploadPath);
  const { error: urlErr } = await (supabase as any)
    .from('reactions').update({ video_url: cloudUrl }).eq('id', reactionId);
  if (urlErr) { throw urlErr; }

  // 5. Add recipients (status 'pending' → they get the share and can react).
  const { error: mErr } = await (supabase as any)
    .from('thread_members')
    .insert(recipientIds.map(uid => ({ thread_id: threadId, user_id: uid, status: 'pending' })));
  if (mErr) { throw mErr; }

  // 6. Ensure a private channel exists for each pair (fire-and-forget, matches sendThread).
  recipientIds.forEach(uid => { ensurePrivateChannel(userId, uid).catch(() => {}); });

  return { threadId, reactionId };
}
