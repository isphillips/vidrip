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
    // createThumbnail's native side is picky about the path form: some builds want a bare filesystem
    // path, others a file:// URL — the wrong one throws NSCocoaError ("no such file") on a clip that
    // plays perfectly in AVPlayer. Try the file:// URL, then fall back to the bare path.
    let thumb;
    try {
      thumb = await createThumbnail({ url, timeStamp, format: 'jpeg' });
    } catch {
      thumb = await createThumbnail({ url: url.replace(/^file:\/\//, ''), timeStamp, format: 'jpeg' });
    }
    thumbPath = thumb.path;
    const bare = thumbPath.replace(/^file:\/\//, '');
    const w = thumb.width || 0;
    const h = thumb.height || 0;

    // Downscale to keep the moderation payload small. On some devices ImageEditor.cropImage throws an
    // NSCocoaError reading/writing the just-written thumbnail — don't drop the frame over that: fall back
    // to the full-size JPEG (a bigger payload still moderates; a skipped frame silently bypasses the check).
    try {
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
      if (cropped.base64) { return cropped.base64; }
    } catch (cropErr: any) {
      log.warn('[moderation] downscale failed, using full frame:', cropErr?.code ?? cropErr?.message ?? String(cropErr));
    }
    // Fallback: read the raw createThumbnail JPEG straight to base64.
    return await RNFS.readFile(bare, 'base64');
  } catch (e: any) {
    // createThumbnail uses AVAssetImageGenerator; on a just-recorded clip it can throw when the frame at
    // this timestamp isn't readable. Fail-open (skip the frame) — log WHY so the native error lines are
    // attributable to moderation frame-sampling, not a lost recording.
    log.warn(`[moderation] frame extract failed at t=${(timeStamp / 1000).toFixed(1)}s (skipping):`, e?.code ?? e?.message ?? String(e));
    return null;
  } finally {
    if (thumbPath) { RNFS.unlink(thumbPath.replace('file://', '')).catch(() => {}); }
  }
}

/** One extraction pass: pull downscaled JPEG frames from a local video file (limited concurrency). */
async function extractPass(url: string, stamps: number[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < stamps.length; i += EXTRACT_CONCURRENCY) {
    const batch = stamps.slice(i, i + EXTRACT_CONCURRENCY);
    const results = await Promise.all(batch.map(t => frameAt(url, t)));
    for (const f of results) { if (f) { out.push(f); } }
  }
  return out;
}

/** Pull downscaled JPEG frames from a local video file. Retries once after a short settle if the first
 *  pass yields nothing — AVAssetImageGenerator can throw NSCocoaError reading a file the moment it lands
 *  on disk (e.g. just moved into the cache), even though it's a perfectly readable clip a beat later. */
async function extractFrames(filePath: string, durationSec: number): Promise<string[]> {
  const bare = filePath.replace(/^file:\/\//, '');
  const url = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
  const stamps = sampleStampsMs(durationSec);

  // A missing / zero-byte file means the wrong path reached here — surface it, since it silently skips
  // moderation (fail-open below) rather than being a genuine "clip is clean" result.
  try {
    const st = await RNFS.stat(bare);
    if (!st || Number(st.size) === 0) { log.error(`[moderation] source file missing/empty, cannot moderate: ${bare}`); return []; }
  } catch { log.error(`[moderation] source file not found, cannot moderate: ${bare}`); return []; }

  let out = await extractPass(url, stamps);
  if (out.length === 0) {
    await new Promise<void>(r => setTimeout(r, 800));   // let the file settle, then try once more
    out = await extractPass(url, stamps);
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
  if (frames.length === 0) {
    // Fail open so a device-side extraction hiccup never blocks a legitimate post — but say so loudly:
    // this clip went UNMODERATED, which matters for the 1.2 guarantee (vs. a normal "clean" pass).
    log.error(`[moderation] no frames extracted — ${opts.contentType} posted WITHOUT a moderation check`);
    return;
  }

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
