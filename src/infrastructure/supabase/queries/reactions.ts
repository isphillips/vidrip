import { log } from '../../logging/logger';
import RNFS from 'react-native-fs';
import { supabase } from '../client';
import { R2_ENABLED } from '../../storage/r2Config';
import { uploadToR2 } from '../../storage/uploadToR2';

export type EmojiReaction = { id: string; emoji: string; user_id: string };

export async function fetchEmojiReactions(reactionId: string): Promise<EmojiReaction[]> {
  const { data, error } = await (supabase as any)
    .from('emoji_reactions')
    .select('id, emoji, user_id')
    .eq('reaction_id', reactionId);
  if (error) { throw error; }
  return data ?? [];
}

export async function addEmojiReaction(
  reactionId: string,
  userId: string,
  emoji: string,
): Promise<string> {
  const { data, error } = await (supabase as any)
    .from('emoji_reactions')
    .insert({ reaction_id: reactionId, user_id: userId, emoji })
    .select('id')
    .single();
  if (error) {
    throw error;
  }
  return data.id;
}

export async function removeEmojiReaction(
  reactionId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('emoji_reactions')
    .delete()
    .eq('reaction_id', reactionId)
    .eq('user_id', userId)
    .eq('emoji', emoji);
  if (error) {
    log.error('[removeEmojiReaction] error:', JSON.stringify(error));
    throw error;
  }
}

export async function uploadReaction({
  userId,
  threadId,
  filePath,
  duration,
}: {
  userId: string;
  threadId: string;
  filePath: string;
  duration: number;
}): Promise<void> {
  const uploadPath = `${userId}/${threadId}/${Date.now()}.mp4`;

  // Strip file:// prefix — RNFS works with bare filesystem paths
  const localPath = filePath.replace(/^file:\/\//, '');

  let videoUrl: string;
  if (R2_ENABLED) {
    // Upload via the Pages Function → r2://reactions/<key> marker (signed at read time).
    videoUrl = await uploadToR2('reactions', uploadPath, localPath);
  } else {
    // Read the recorded video file as base64 then convert to a Uint8Array.
    // XHR with responseType='arraybuffer' returns 0 bytes for file:// on iOS;
    // RNFS is the reliable way to read local files on device.
    const base64 = await RNFS.readFile(localPath, 'base64');
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const { error: uploadError } = await supabase.storage
      .from('reactions')
      .upload(uploadPath, bytes, { contentType: 'video/mp4', upsert: false });

    if (uploadError) {
      log.error('[uploadReaction] storage error:', JSON.stringify(uploadError));
      throw uploadError;
    }

    videoUrl = supabase.storage.from('reactions').getPublicUrl(uploadPath).data.publicUrl;
  }

  const { error: insertError } = await (supabase as any)
    .from('reactions')
    .insert({
      thread_id: threadId,
      user_id: userId,
      video_url: videoUrl,
      duration: Math.round(duration),
    });

  if (insertError) {
    log.error('[uploadReaction] insert error:', JSON.stringify(insertError));
    throw insertError;
  }

  await (supabase as any)
    .from('thread_members')
    .update({ status: 'reacted' })
    .eq('thread_id', threadId)
    .eq('user_id', userId);
}
