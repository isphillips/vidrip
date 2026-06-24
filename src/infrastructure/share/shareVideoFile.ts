import Share from 'react-native-share';

// Attribution caption pre-filled into the share sheet. Targets that accept text (Messages, WhatsApp,
// some social composers) pick it up; the in-pixel watermark covers the rest (TikTok/IG drop the text).
export const SHARE_CAPTION = 'Made with Vidrip 💧 vidrip.app';

/**
 * Open the OS share sheet to send a local video FILE out to other apps (TikTok, Instagram, Stories,
 * Messages, …). Uses react-native-share so the file shares on BOTH iOS and Android (RN's core Share
 * API can't share a file on Android). A cancel/dismiss is not an error.
 */
export async function shareVideoFile(fileUri: string, opts?: { title?: string }): Promise<void> {
  const title = opts?.title?.trim();
  const message = title ? `${title} · ${SHARE_CAPTION}` : SHARE_CAPTION;
  try {
    await Share.open({
      url: fileUri,
      type: 'video/mp4',
      message,
      filename: 'vidrip-clip',
      failOnCancel: false,
    });
  } catch (e: any) {
    // failOnCancel:false resolves on dismiss, but guard older-RN behaviour where cancel still throws.
    const msg = String(e?.message ?? e ?? '');
    if (/cancel|dismiss|did not share/i.test(msg)) { return; }
    throw e;
  }
}
