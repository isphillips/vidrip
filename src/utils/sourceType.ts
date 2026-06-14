// Display name for a video's source platform (youtube → "YouTube", bunny → "Vidrip",
// etc.). Shared by the feed/thread and channel post views so the labels stay in sync.
export function formatSourceType(t: string): string {
  switch (t) {
    case 'tiktok': return 'TikTok';
    case 'youtube': return 'YouTube';
    case 'instagram': return 'Instagram';
    case 'bunny': return 'Vidrip';
    default: return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }
}
