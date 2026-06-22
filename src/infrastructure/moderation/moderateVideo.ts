import { log } from '../logging/logger';
import { createThumbnail } from 'react-native-create-thumbnail';
import ImageEditor from '@react-native-community/image-editor';
import RNFS from 'react-native-fs';
import { supabase } from '../supabase/client';

/**
 * Thrown when a recorded clip is rejected by automated moderation. The message is
 * user-facing (shown in the upload toast / alert). `categories` lists the OpenAI
 * moderation categories that crossed threshold.
 */
export class ModerationRejected extends Error {
  categories: string[];
  constructor(message: string, categories: string[] = []) {
    super(message);
    this.name = 'ModerationRejected';
    this.categories = categories;
  }
}

export type ModerationContentType = 'reaction' | 'channel_clip' | 'channel_video' | 'review' | 'comment';

const FRAME_INTERVAL_SEC = 2;    // sample ~one frame every 2s …
const MAX_FRAMES = 90;           // … capped (covers a full 180s clip at 2s spacing).
const FRAME_MAX_EDGE = 320;      // downscale longest edge — plenty for nudity detection.
const EXTRACT_CONCURRENCY = 5;   // parallel thumbnail jobs to keep extraction fast.

/** Evenly spaced sample timestamps (ms) across the clip, biased off the exact ends. */
function sampleStampsMs(durationSec: number): number[] {
  const dur = Math.max(0, durationSec || 0);
  if (dur <= 0) { return [0]; }
  const count = Math.max(3, Math.min(MAX_FRAMES, Math.ceil(dur / FRAME_INTERVAL_SEC)));
  const stamps: number[] = [];
  for (let i = 0; i < count; i++) {
    stamps.push(Math.round(((i + 0.5) / count) * dur * 1000));
  }
  return stamps;
}

/** Grab one frame at `timeStamp`, downscaled, as base64 JPEG. Null if it can't be read. */
async function frameAt(url: string, timeStamp: number): Promise<string | null> {
  let thumbPath: string | null = null;
  try {
    const thumb = await createThumbnail({ url, timeStamp, format: 'jpeg' });
    thumbPath = thumb.path;
    const w = thumb.width || 0;
    const h = thumb.height || 0;
    const scale = w && h ? Math.min(1, FRAME_MAX_EDGE / Math.max(w, h)) : 1;
    const cropUri = thumbPath.startsWith('file://') ? thumbPath : `file://${thumbPath}`;
    const cropped = await ImageEditor.cropImage(cropUri, {
      offset: { x: 0, y: 0 },
      size: { width: w || FRAME_MAX_EDGE, height: h || FRAME_MAX_EDGE },
      displaySize: { width: Math.round((w || FRAME_MAX_EDGE) * scale), height: Math.round((h || FRAME_MAX_EDGE) * scale) },
      resizeMode: 'contain',
      quality: 0.6,
      format: 'jpeg',
      includeBase64: true,
    });
    if (cropped.uri) { RNFS.unlink(cropped.uri.replace('file://', '')).catch(() => {}); }
    return cropped.base64 ?? null;
  } catch {
    return null;
  } finally {
    if (thumbPath) { RNFS.unlink(thumbPath.replace('file://', '')).catch(() => {}); }
  }
}

/** Pull downscaled JPEG frames from a local video file (limited concurrency). */
async function extractFrames(filePath: string, durationSec: number): Promise<string[]> {
  const url = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
  const stamps = sampleStampsMs(durationSec);
  const out: string[] = [];
  for (let i = 0; i < stamps.length; i += EXTRACT_CONCURRENCY) {
    const batch = stamps.slice(i, i + EXTRACT_CONCURRENCY);
    const results = await Promise.all(batch.map(t => frameAt(url, t)));
    for (const f of results) { if (f) { out.push(f); } }
  }
  return out;
}

/**
 * Moderate a freshly recorded clip BEFORE it's uploaded/published. Samples frames
 * on-device and scores them via the `moderate-frames` edge function (OpenAI).
 *
 * Throws {@link ModerationRejected} if the clip is blocked. Fails OPEN on any
 * infrastructure error (no frames, not signed in, edge/provider outage) so a
 * moderation hiccup never blocks legitimate posts — the server still logs those.
 */
export async function assertVideoAllowed(
  filePath: string,
  opts: { durationSec: number; contentType: ModerationContentType },
): Promise<void> {
  const frames = await extractFrames(filePath, opts.durationSec);
  if (frames.length === 0) { return; }   // fail open

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) { return; } // fail open (normal flow will surface auth errors)

  let data: any, error: any;
  try {
    ({ data, error } = await supabase.functions.invoke('moderate-frames', {
      body: { frames, contentType: opts.contentType },
      headers: { Authorization: `Bearer ${session.access_token}` },
    }));
  } catch (e) {
    log.warn('[moderation] check failed, allowing:', e);
    return; // fail open
  }
  if (error) {
    log.warn('[moderation] edge error, allowing:', error.message);
    return; // fail open
  }
  if (data && data.allowed === false) {
    throw new ModerationRejected(
      data.message ?? "This video can't be posted because it appears to contain explicit content.",
      data.categories ?? [],
    );
  }
}
