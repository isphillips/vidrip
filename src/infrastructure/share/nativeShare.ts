import { Share, Platform } from 'react-native';

/**
 * Open the OS native share sheet to share text/a link OUT to other apps
 * (iMessage, WhatsApp, etc.). No backend or extra dependency — RN's built-in
 * Share API. On iOS a separate `url` renders a rich preview; on Android only
 * `message` is used, so we fold the url into it.
 */
export async function shareTextNative(message: string, url?: string): Promise<void> {
  try {
    if (Platform.OS === 'ios' && url) {
      await Share.share({ message, url });
    } else {
      await Share.share({ message: url ? `${message} ${url}`.trim() : message });
    }
  } catch {
    /* user dismissed the sheet — not an error */
  }
}

/** Public watch URL for a source video, used when sharing a video OUT. */
export function sourceVideoUrl(videoId: string, sourceType: 'youtube' | 'tiktok'): string {
  return sourceType === 'tiktok'
    ? `https://www.tiktok.com/@tiktok/video/${videoId}`
    : `https://www.youtube.com/shorts/${videoId}`;
}
