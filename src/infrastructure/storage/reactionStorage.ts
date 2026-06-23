import { log } from '../logging/logger';
import { supabase } from '../supabase/client';
import { moveToReactionsDir, localPathForReaction, downloadReaction, hasLocalCopy } from './localReactionStorage';
import type { StorageMode } from './config';

export interface SaveReactionParams {
  userId: string;
  threadId: string;
  filePath: string;
  duration: number;
  mode: StorageMode;
  ytVideoId?: string;
  ytStartOffset?: number;
  sourceType?: 'youtube' | 'tiktok' | 'instagram' | 'facebook';
  recordedWithHeadphones?: boolean;
  // Optional "afterthought" outro clip recorded right after the reaction; uploaded to the
  // same bucket and stored on afterthought_url/afterthought_duration to play as a post-roll.
  afterthought?: { path: string; duration: number } | null;
  // Fires once the row is inserted and the local copy is in place (before the
  // slow relay upload), so the caller can show the reaction immediately.
  onCommitted?: (reactionId: string) => void;
}

/** Upload an afterthought clip for an existing reaction and set its columns (best-effort). */
async function relayAfterthought(
  userId: string, threadId: string, reactionId: string,
  afterthought: { path: string; duration: number },
): Promise<void> {
  try {
    const url = await uploadToCloud(afterthought.path, `${userId}/${threadId}/${reactionId}-afterthought.mp4`);
    await (supabase as any).from('reactions')
      .update({ afterthought_url: url, afterthought_duration: Math.round(afterthought.duration) })
      .eq('id', reactionId);
  } catch (e) {
    log.error('[saveReaction] afterthought relay failed:', JSON.stringify(e));
  }
}

export interface SaveReactionResult {
  reactionId: string;
  localPath: string | null;
  cloudUrl: string | null;
  storageMode: StorageMode;
}

// ─── Cloud path (relay upload) ─────────────────────────────────────────────

/** Upload a local file to the (private) `reactions` bucket at `uploadPath` and
 *  return its public-form URL (parsed + re-signed on read). Exported so the
 *  intro-clip flow can reuse the same relay upload. `upsert` overwrites an
 *  existing object at the path (intros use a deterministic path so retries /
 *  re-records replace rather than orphan). */
export async function uploadToCloud(localPath: string, uploadPath: string, upsert = false): Promise<string> {
  const fileUri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) { throw new Error('Not authenticated'); }

  const formData = new FormData();
  (formData as any).append('file', { uri: fileUri, type: 'video/mp4', name: 'video.mp4' });

  const uploadUrl = `https://ltpscwticavqutbzrrjb.supabase.co/storage/v1/object/reactions/${uploadPath}`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cHNjd3RpY2F2cXV0YnpycmpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDEwMTEsImV4cCI6MjA5NTc3NzAxMX0.wHXV1IFLk7UbRWOrJWZN-sjsw8Kau0Rn6OKs29debKo',
      'x-upsert': upsert ? 'true' : 'false',
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Upload failed (${response.status}): ${body}`);
  }

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
  ytVideoId,
  ytStartOffset = 0,
  sourceType = 'youtube',
  recordedWithHeadphones = false,
  afterthought = null,
  onCommitted,
}: SaveReactionParams): Promise<SaveReactionResult> {

  if (mode === 'cloud') {
    // Insert the row first (video_url null) so it has an id, and keep a local copy
    // keyed by that id — the reaction is committed + playable on THIS device before
    // the (slow) relay upload, so it can show in the thread immediately. Other
    // devices download it once video_url is set below.
    const { data, error: insertError } = await (supabase as any)
      .from('reactions')
      .insert({
        thread_id: threadId,
        user_id: userId,
        video_url: null,
        duration: Math.round(duration),
        storage_mode: 'cloud',
        source_type: sourceType,
        recorded_with_headphones: recordedWithHeadphones,
        ...(ytVideoId ? { yt_video_id: ytVideoId, yt_start_offset: ytStartOffset } : {}),
      })
      .select('id')
      .single();
    if (insertError) { throw insertError; }

    const reactionId: string = data.id;
    const localPath = await moveToReactionsDir(filePath, reactionId);
    onCommitted?.(reactionId);

    let cloudUrl: string | null = null;
    try {
      const uploadPath = `${userId}/${threadId}/${reactionId}.mp4`;
      cloudUrl = await uploadToCloud(localPath, uploadPath);
      const { error: urlErr } = await (supabase as any)
        .from('reactions').update({ video_url: cloudUrl }).eq('id', reactionId);
      // The clip is in storage, but if this write is rejected (e.g. a missing column GRANT)
      // video_url stays null and recipients see "Not available". Surface it loudly instead of
      // failing silently — and don't report a cloudUrl the row doesn't actually carry.
      if (urlErr) { cloudUrl = null; throw urlErr; }
    } catch (e) {
      log.error('[saveReaction] cloud relay upload/link failed:', JSON.stringify(e));
    }

    if (afterthought) { await relayAfterthought(userId, threadId, reactionId, afterthought); }

    await (supabase as any)
      .from('thread_members')
      .update({ status: 'reacted' })
      .eq('thread_id', threadId)
      .eq('user_id', userId);

    return { reactionId, localPath, cloudUrl, storageMode: 'cloud' };
  }

  // ─── Local (ephemeral relay) mode ───────────────────────────────────────
  // The recorder keeps a permanent local copy; a relay copy is ALSO uploaded so
  // recipients can download it. A TTL cleanup job removes the cloud relay later.
  // 1. Insert DB row first to get the UUID (video_url nullable in Phase 1 migration)
  const { data, error: insertError } = await (supabase as any)
    .from('reactions')
    .insert({
      thread_id: threadId,
      user_id: userId,
      video_url: null,
      duration: Math.round(duration),
      storage_mode: 'local',
      source_type: sourceType,
      recorded_with_headphones: recordedWithHeadphones,
      ...(ytVideoId ? { yt_video_id: ytVideoId, yt_start_offset: ytStartOffset } : {}),
    })
    .select('id')
    .single();
  if (insertError) { throw insertError; }

  const reactionId: string = data.id;

  // 2. Move temp file to permanent local location keyed by the reaction UUID
  const localPath = await moveToReactionsDir(filePath, reactionId);
  onCommitted?.(reactionId);   // local copy ready → caller can show it now

  // 3. Upload the relay copy so recipients can fetch it (best-effort; the local
  //    copy is the source of truth for the recorder). Path is deterministic so
  //    the TTL cleanup can find and delete it.
  let cloudUrl: string | null = null;
  try {
    const uploadPath = `${userId}/${threadId}/${reactionId}.mp4`;
    cloudUrl = await uploadToCloud(localPath, uploadPath);
    const { error: urlErr } = await (supabase as any)
      .from('reactions').update({ video_url: cloudUrl }).eq('id', reactionId);
    // See cloud-path note above: a silently-rejected video_url write leaves recipients with
    // "Not available" while the clip sits in storage. Surface it.
    if (urlErr) { cloudUrl = null; throw urlErr; }
  } catch (e) {
    log.error('[saveReaction] relay upload/link failed:', JSON.stringify(e));
  }

  if (afterthought) { await relayAfterthought(userId, threadId, reactionId, afterthought); }

  // 4. Mark thread member as reacted
  await (supabase as any)
    .from('thread_members')
    .update({ status: 'reacted' })
    .eq('thread_id', threadId)
    .eq('user_id', userId);

  return { reactionId, localPath, cloudUrl, storageMode: 'local' };
}

/** Sign a reactions-bucket URL for playback (used for afterthought outro clips). */
export async function signReactionUrl(url: string): Promise<string | null> {
  const m = url.match(/\/storage\/v1\/object\/(?:public\/)?reactions\/(.+?)(?:\?|$)/);
  if (!m) { return null; }
  const { data } = await supabase.storage.from('reactions').createSignedUrl(decodeURIComponent(m[1]), 3600);
  return data?.signedUrl ?? null;
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
