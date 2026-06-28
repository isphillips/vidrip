import { supabase } from '../supabase/client';
import { uploadToCloud } from './reactionStorage';
import { signR2Url } from './uploadToR2';

/**
 * Share-intro clips reuse the private `reactions` bucket under `intros/…`, so the
 * existing reactions read policy signs them exactly like reactions. The path is
 * unique per upload and uploaded WITHOUT upsert: the `reactions` bucket grants
 * INSERT but has no UPDATE policy, so overwriting an existing object (what upsert
 * does on a retry / re-record) is rejected by RLS (403, "new row violates row
 * level security policy"). A fresh INSERT each time always satisfies the policy;
 * a superseded intro is just an unreferenced object (negligible / TTL-able).
 */

/** Relay-upload an intro clip for a thread; returns its stored (public-form) URL.
 *  Keyed under the uploader's uid (`<uid>/intros/<threadId>/…`) so it satisfies both the
 *  Supabase reactions INSERT policy and the R2 upload Function's uid-prefix rule. */
export async function uploadIntro(threadId: string, localPath: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  const uploadPath = uid
    ? `${uid}/intros/${threadId}/${Date.now()}.mp4`
    : `intros/${threadId}/${Date.now()}.mp4`;
  return uploadToCloud(localPath, uploadPath);
}

/** Resolve a stored intro URL to a fresh signed URL for playback (1h TTL). */
export async function resolveIntroUri(introUrl: string): Promise<string | null> {
  if (introUrl.startsWith('r2://')) { return signR2Url(introUrl); }
  const pathMatch = introUrl.match(
    /\/storage\/v1\/object\/(?:public\/)?reactions\/(.+?)(?:\?|$)/,
  );
  if (!pathMatch) { return null; }

  const { data: signed } = await supabase.storage
    .from('reactions')
    .createSignedUrl(decodeURIComponent(pathMatch[1]), 3600);
  return signed?.signedUrl ?? null;
}
