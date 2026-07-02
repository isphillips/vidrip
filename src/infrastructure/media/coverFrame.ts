import { createThumbnail } from 'react-native-create-thumbnail';
import { log } from '../logging/logger';

/**
 * Capture a still cover frame from a local video as a JPEG on disk, returning its path (or null).
 *
 * createThumbnail's native side (AVAssetImageGenerator on iOS) is picky: it throws NSCocoaError when
 * given the wrong path form (`file://` URL vs a bare filesystem path — which one works varies by build)
 * and when the requested timestamp lands past the end of a short clip. That's why studio-share covers
 * sometimes came back empty on a perfectly playable file. Try both path forms, and fall back to the very
 * first frame if the preferred timestamp fails — so a cover frame is best-effort but reliable across
 * clip lengths and path quirks.
 */
export async function captureCoverFrame(videoUri: string, preferredMs = 1000): Promise<string | null> {
  const bare = videoUri.replace(/^file:\/\//, '');
  const withScheme = videoUri.startsWith('file://') ? videoUri : `file://${videoUri}`;
  const attempts: Array<{ url: string; timeStamp: number }> = [
    { url: withScheme, timeStamp: preferredMs },
    { url: bare, timeStamp: preferredMs },
    { url: withScheme, timeStamp: 0 },   // short clip → the preferred stamp is past its end
    { url: bare, timeStamp: 0 },
  ];
  for (const a of attempts) {
    try {
      const { path } = await createThumbnail({ url: a.url, timeStamp: a.timeStamp, format: 'jpeg' });
      if (path) { return path; }
    } catch { /* try the next path form / timestamp */ }
  }
  log.warn('[coverFrame] could not capture a cover frame from', bare);
  return null;
}
