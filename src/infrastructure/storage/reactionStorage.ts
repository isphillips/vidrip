import RNFS from 'react-native-fs';
import { supabase } from '../supabase/client';
import { moveToReactionsDir, localPathForReaction, downloadReaction, hasLocalCopy } from './localReactionStorage';
import type { StorageMode } from './config';

export interface SaveReactionParams {
  userId: string;
  threadId: string;
  filePath: string;  // temp path from ReplayKit stopCapture()
  duration: number;
  mode: StorageMode;
}

export interface SaveReactionResult {
  reactionId: string;
  localPath: string | null;
  cloudUrl: string | null;
  storageMode: StorageMode;
}

// ─── Cloud path (relay upload) ─────────────────────────────────────────────

async function uploadToCloud(localPath: string, uploadPath: string): Promise<string> {
  const bare = localPath.replace(/^file:\/\//, '');
  const base64 = await RNFS.readFile(bare, 'base64');
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); }

  const { error } = await supabase.storage
    .from('reactions')
    .upload(uploadPath, bytes, { contentType: 'video/mp4', upsert: false });
  if (error) { throw error; }

  const { data: { publicUrl } } = supabase.storage.from('reactions').getPublicUrl(uploadPath);
  return publicUrl;
}

// ─── Main facade ──────────────────────────────────────────────────────────

export async function saveReaction({
  userId,
  threadId,
  filePath,
  duration,
  mode,
}: SaveReactionParams): Promise<SaveReactionResult> {

  if (mode === 'cloud') {
    // Phase 1: identical to original uploadReaction — no behavior change
    const uploadPath = `${userId}/${threadId}/${Date.now()}.mp4`;
    const cloudUrl = await uploadToCloud(filePath, uploadPath);

    const { data, error } = await (supabase as any)
      .from('reactions')
      .insert({
        thread_id: threadId,
        user_id: userId,
        video_url: cloudUrl,
        duration: Math.round(duration),
        storage_mode: 'cloud',
      })
      .select('id')
      .single();
    if (error) { throw error; }

    await (supabase as any)
      .from('thread_members')
      .update({ status: 'reacted' })
      .eq('thread_id', threadId)
      .eq('user_id', userId);

    return { reactionId: data.id, localPath: null, cloudUrl, storageMode: 'cloud' };
  }

  // ─── Local mode ─────────────────────────────────────────────────────────
  // 1. Insert DB row first to get the UUID (video_url nullable in Phase 1 migration)
  const { data, error: insertError } = await (supabase as any)
    .from('reactions')
    .insert({
      thread_id: threadId,
      user_id: userId,
      video_url: null,
      duration: Math.round(duration),
      storage_mode: 'local',
    })
    .select('id')
    .single();
  if (insertError) { throw insertError; }

  const reactionId: string = data.id;

  // 2. Move temp file to permanent local location keyed by the reaction UUID
  const localPath = await moveToReactionsDir(filePath, reactionId);

  // 3. Mark thread member as reacted
  await (supabase as any)
    .from('thread_members')
    .update({ status: 'reacted' })
    .eq('thread_id', threadId)
    .eq('user_id', userId);

  return { reactionId, localPath, cloudUrl: null, storageMode: 'local' };
}

// ─── Playback resolution ──────────────────────────────────────────────────

export interface ResolvedUri {
  uri: string;
  source: 'local' | 'cloud';
  needsDownload: boolean;
  cloudUrl?: string;
}

export async function resolveReactionUri(reaction: {
  id: string;
  video_url: string | null;
  storage_mode?: string;
}): Promise<ResolvedUri | null> {

  // 1. Local file exists on this device → play immediately (any storage mode)
  if (await hasLocalCopy(reaction.id)) {
    return {
      uri: `file://${localPathForReaction(reaction.id)}`,
      source: 'local',
      needsDownload: false,
    };
  }

  // 2. Cloud URL available → can download or stream
  if (reaction.video_url) {
    // Generate a fresh signed URL
    const pathMatch = reaction.video_url.match(
      /\/storage\/v1\/object\/(?:public\/)?reactions\/(.+?)(?:\?|$)/,
    );
    if (pathMatch) {
      const { data: signed } = await supabase.storage
        .from('reactions')
        .createSignedUrl(decodeURIComponent(pathMatch[1]), 3600);
      if (signed?.signedUrl) {
        return {
          uri: signed.signedUrl,
          source: 'cloud',
          needsDownload: true,
          cloudUrl: signed.signedUrl,
        };
      }
    }
  }

  // 3. Nothing available
  return null;
}

/** Record that this device/user has downloaded a reaction (for cloud cleanup tracking). */
export async function recordReactionDownload(reactionId: string, userId: string): Promise<void> {
  await (supabase as any)
    .from('reaction_downloads')
    .upsert({ reaction_id: reactionId, user_id: userId }, { onConflict: 'reaction_id,user_id' });
}

/** Download a reaction from cloud and save locally. Returns local file:// URI. */
export async function downloadAndCache(
  reactionId: string,
  cloudUrl: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const localPath = await downloadReaction(reactionId, cloudUrl, onProgress);
  return `file://${localPath}`;
}
