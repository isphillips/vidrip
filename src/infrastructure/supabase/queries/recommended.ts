import { supabase } from '../client';
import type { FeedItem } from './connectedFeed';

// Server enforces 1 refresh / 15 min (fetch-recommended COOLDOWN_MS) — mirror it
// client-side so the button can show a live countdown.
export const RECOMMENDED_COOLDOWN_MS = 15 * 60 * 1000;
export function recommendedCooldownRemainingMs(lastFetchedAt: string | null): number {
  if (!lastFetchedAt) { return 0; }
  return Math.max(0, RECOMMENDED_COOLDOWN_MS - (Date.now() - new Date(lastFetchedAt).getTime()));
}

/** The user's cached "Recommended" videos + when they were last refreshed. */
export async function fetchRecommended(
  userId: string, limit = 60,
): Promise<{ items: FeedItem[]; lastFetchedAt: string | null }> {
  const { data, error } = await (supabase as any)
    .from('recommended_items')
    .select('video_id, title, thumbnail, channel_title, source_type, published_at, fetched_at')
    .eq('user_id', userId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('fetched_at', { ascending: false })
    .limit(limit);
  if (error) { throw error; }
  const rows = data ?? [];
  return {
    items: rows.map((r: any) => ({
      videoId: r.video_id,
      title: r.title ?? '',
      thumbnail: r.thumbnail ?? '',
      channelTitle: r.channel_title ?? '',
      sourceType: (r.source_type ?? 'youtube') as 'youtube' | 'tiktok' | 'instagram',
      publishedAt: r.published_at ?? null,
    })),
    // All rows from one refresh share the same fetched_at.
    lastFetchedAt: rows[0]?.fetched_at ?? null,
  };
}

/**
 * Ask the fetch-recommended edge function to rebuild the user's recommendations.
 * Server-enforced to 1 request / 15 min; throws a friendly message (incl. cooldown).
 */
export async function refreshRecommended(): Promise<{ imported: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) { throw new Error('You appear to be signed out. Sign in and try again.'); }
  const { data, error } = await supabase.functions.invoke('fetch-recommended', {
    body: { provider: 'youtube' },
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
