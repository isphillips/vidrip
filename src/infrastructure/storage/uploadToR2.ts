import { log } from '../logging/logger';
import { supabase } from '../supabase/client';
import { R2_API_BASE, R2_PRIVATE_PREFIX } from './r2Config';

// Network helpers for the R2 media path. Uploads go through the Cloudflare Pages Function
// (`/api/media/upload`, authenticated by the user's Supabase JWT); private `reactions` reads
// are resolved to a short-lived presigned URL via `/api/media/sign`.

// ── Upload hardening (shared by reaction + channel-clip uploads) ────────────────────────────────
// Uploads to R2 are the slow, network-flaky tail of saving a reaction. Two guards, applied at this
// single choke point (which runs AFTER the optimistic commit shows, so it never delays display):
//  1. A concurrency semaphore — a doom-react burst would otherwise fire N multi-MB uploads at once and
//     saturate the connection; cap it so uploads don't starve each other (and the moderation calls).
//  2. Retry-with-backoff — a transient failure used to leave video_url null forever ("Not available" for
//     recipients). The upload is idempotent (deterministic key, overwrites), so retrying is safe.
const MAX_CONCURRENT_UPLOADS = 2;
const UPLOAD_ATTEMPTS = 3;

let _permits = MAX_CONCURRENT_UPLOADS;
const _waiters: Array<() => void> = [];
function acquireUploadSlot(): Promise<void> {
  if (_permits > 0) { _permits--; return Promise.resolve(); }
  return new Promise<void>(resolve => _waiters.push(resolve));   // resumed = permit handed over by release
}
function releaseUploadSlot(): void {
  const next = _waiters.shift();
  if (next) { next(); } else { _permits++; }
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** One upload attempt to the Pages Function. */
async function uploadToR2Once(bucket: string, key: string, localPath: string, contentType: string): Promise<string> {
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
 * Upload a local file to R2 via the Pages Function. Returns the value to store in the DB:
 * the public custom-domain URL for public buckets, or an `r2://<bucket>/<key>` marker for the
 * private `reactions` bucket (resolved at read time by signR2Url).
 * Concurrency-capped + retried with exponential backoff (see the notes above).
 */
export async function uploadToR2(
  bucket: string,
  key: string,
  localPath: string,
  contentType = 'video/mp4',
): Promise<string> {
  await acquireUploadSlot();
  try {
    let lastErr: unknown;
    for (let attempt = 0; attempt < UPLOAD_ATTEMPTS; attempt++) {
      try {
        return await uploadToR2Once(bucket, key, localPath, contentType);
      } catch (e) {
        lastErr = e;
        if (attempt < UPLOAD_ATTEMPTS - 1) {
          log.warn(`[uploadToR2] attempt ${attempt + 1}/${UPLOAD_ATTEMPTS} failed for ${bucket}/${key}, retrying`);
          await delay(1000 * 2 ** attempt);   // 1s, 2s
        }
      }
    }
    throw lastErr;
  } finally {
    releaseUploadSlot();
  }
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
