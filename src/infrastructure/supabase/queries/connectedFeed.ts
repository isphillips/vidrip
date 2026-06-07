import { supabase } from '../client';
import type { SyncProvider } from '../../oauth/config';

export type FeedItem = {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  sourceType: 'youtube' | 'tiktok';
  publishedAt: string | null;
};

/** The user's cached "For You" feed items (newest first). */
export async function fetchConnectedFeed(userId: string, limit = 50): Promise<FeedItem[]> {
  const { data, error } = await (supabase as any)
    .from('connected_feed_items')
    .select('video_id, title, thumbnail, channel_title, source_type, published_at')
    .eq('user_id', userId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('fetched_at', { ascending: false })
    .limit(limit);
  if (error) { throw error; }
  return (data ?? []).map((r: any) => ({
    videoId: r.video_id,
    title: r.title ?? '',
    thumbnail: r.thumbnail ?? '',
    channelTitle: r.channel_title ?? '',
    sourceType: (r.source_type ?? 'youtube') as 'youtube' | 'tiktok',
    publishedAt: r.published_at ?? null,
  }));
}

/**
 * Ask the refresh-feed edge function to re-pull the user's feed. Server-enforced
 * to 1 request / 15 min; throws with a friendly message (incl. cooldown) on 429.
 */
export async function refreshConnectedFeed(provider: SyncProvider): Promise<{ imported: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) { throw new Error('You appear to be signed out. Sign in and try again.'); }
  const { data, error } = await supabase.functions.invoke('refresh-feed', {
    body: { provider },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    let msg = error.message;
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) { msg = body.error; }
    } catch { /* keep msg */ }
    throw new Error(msg);
  }
  if (data?.error) { throw new Error(data.error); }
  return { imported: data?.imported ?? 0 };
}

/** Minutes until the feed can be refreshed again, given the last refresh time. */
export const FEED_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;
export function feedCooldownRemainingMs(lastSyncedAt: string | null): number {
  if (!lastSyncedAt) { return 0; }
  const elapsed = Date.now() - new Date(lastSyncedAt).getTime();
  return Math.max(0, FEED_REFRESH_COOLDOWN_MS - elapsed);
}
