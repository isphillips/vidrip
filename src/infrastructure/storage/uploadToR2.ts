import { supabase } from '../supabase/client';
import { R2_API_BASE, R2_PRIVATE_PREFIX } from './r2Config';

// Network helpers for the R2 media path. Uploads go through the Cloudflare Pages Function
// (`/api/media/upload`, authenticated by the user's Supabase JWT); private `reactions` reads
// are resolved to a short-lived presigned URL via `/api/media/sign`.

/**
 * Upload a local file to R2 via the Pages Function. Returns the value to store in the DB:
 * the public custom-domain URL for public buckets, or an `r2://<bucket>/<key>` marker for the
 * private `reactions` bucket (resolved at read time by signR2Url).
 */
export async function uploadToR2(
  bucket: string,
  key: string,
  localPath: string,
  contentType = 'video/mp4',
): Promise<string> {
  const uri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) { throw new Error('Not authenticated'); }

  const form = new FormData();
  form.append('bucket', bucket);
  form.append('key', key);
  (form as any).append('file', { uri, type: contentType, name: key.split('/').pop() || 'upload' });

  const res = await fetch(`${R2_API_BASE}/api/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { throw new Error((body as any)?.error ?? `R2 upload failed (${res.status})`); }
  return (body as any).url as string;
}

/**
 * Resolve an `r2://<bucket>/<key>` marker to a short-lived presigned GET URL for playback.
 * Returns null if the input isn't an R2 private marker or signing fails.
 */
export async function signR2Url(storedUrl: string | null | undefined): Promise<string | null> {
  if (!storedUrl || !storedUrl.startsWith(R2_PRIVATE_PREFIX)) { return null; }
  const m = storedUrl.slice(R2_PRIVATE_PREFIX.length).match(/^([^/]+)\/(.+)$/);
  if (!m) { return null; }
  const [, bucket, key] = m;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) { return null; }

  const res = await fetch(
    `${R2_API_BASE}/api/media/sign?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) { return null; }
  const body = await res.json().catch(() => null);
  return (body as any)?.url ?? null;
}
