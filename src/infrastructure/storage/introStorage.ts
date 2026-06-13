import { supabase } from '../supabase/client';
import { uploadToCloud } from './reactionStorage';

/**
 * Share-intro clips reuse the private `reactions` bucket. The object path is
 * `intros/{threadId}/intro.mp4` — threadId sits in the same path segment (2) as
 * a reaction's `{userId}/{threadId}/{reactionId}.mp4`, so the existing
 * thread-member read policy covers it and playback signs URLs exactly like
 * reactions do. The path is deterministic (one intro per thread) and uploaded
 * with upsert, so a retry or re-record overwrites it rather than orphaning files.
 */

/** Relay-upload an intro clip for a thread; returns its stored (public-form) URL. */
export async function uploadIntro(threadId: string, localPath: string): Promise<string> {
  const uploadPath = `intros/${threadId}/intro.mp4`;
  return uploadToCloud(localPath, uploadPath, true);
}

/** Resolve a stored intro URL to a fresh signed URL for playback (1h TTL). */
export async function resolveIntroUri(introUrl: string): Promise<string | null> {
  const pathMatch = introUrl.match(
    /\/storage\/v1\/object\/(?:public\/)?reactions\/(.+?)(?:\?|$)/,
  );
  if (!pathMatch) { return null; }

  const { data: signed } = await supabase.storage
    .from('reactions')
    .createSignedUrl(decodeURIComponent(pathMatch[1]), 3600);
  return signed?.signedUrl ?? null;
}
