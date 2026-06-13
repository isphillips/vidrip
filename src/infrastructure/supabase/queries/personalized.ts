import { supabase } from '../client';
import type { ShortRow } from './shorts';

// First-party personalization — no search/recommendation API. Both helpers call
// SECURITY DEFINER RPCs that mine reactions / shares / comments / the friend graph
// against the existing `shorts` pool (see migration 20260613100000).

export type FriendsTrendingItem = {
  videoId:      string;
  title:        string;
  thumbnail:    string;
  channelTitle: string;
  sourceType:   'youtube' | 'tiktok' | 'instagram';
  duration:     number;
  friendCount:  number;
};

/**
 * Short-form videos the user's friends recently reacted to or shared (and the user
 * hasn't reacted to yet), ranked by recency-decayed friend engagement. Social proof
 * from people you actually know — the personalization signal YouTube can't see.
 */
export async function fetchFriendsTrending(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<FriendsTrendingItem[]> {
  const { data, error } = await (supabase as any).rpc('fetch_friends_trending', {
    p_user_id: userId, p_limit: limit, p_offset: offset,
  });
  if (error) { throw error; }
  return (data ?? []).map((r: any) => ({
    videoId:      r.video_id,
    title:        r.title ?? '',
    thumbnail:    r.thumbnail ?? '',
    channelTitle: r.channel_title ?? '',
    sourceType:   (r.source_type ?? 'youtube') as FriendsTrendingItem['sourceType'],
    duration:     r.duration ?? 0,
    friendCount:  r.friend_count ?? 0,
  }));
}

/**
 * The default browse grid re-ranked by the caller's own category + channel affinity
 * blended with recency. Returns the same shape as fetchShorts so it drops straight
 * into the existing grid. Users with no history get ~recency order (today's behavior).
 */
export async function fetchPersonalizedShorts(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<ShortRow[]> {
  const { data, error } = await (supabase as any).rpc('fetch_personalized_shorts', {
    p_user_id: userId, p_limit: limit, p_offset: offset,
  });
  if (error) { throw error; }
  return (data ?? []).map((r: any) => ({
    videoId:      r.video_id,
    title:        r.title,
    thumbnail:    r.thumbnail,
    channelTitle: r.channel_title ?? '',
    duration:     r.duration ?? 0,
    category:     r.category ?? 'latest',
    fetchedAt:    r.fetched_at ?? '',
  }));
}

/**
 * Hybrid Trending grid: first-party reaction/share velocity (last 48h) blended with
 * the mostPopular 'trending' baseline. Same shape as fetchShorts so it drops into the
 * Trending pill exactly like fetchPersonalizedShorts does for the For You pill.
 */
export async function fetchTrending(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<ShortRow[]> {
  const { data, error } = await (supabase as any).rpc('fetch_trending', {
    p_user_id: userId, p_limit: limit, p_offset: offset,
  });
  if (error) { throw error; }
  return (data ?? []).map((r: any) => ({
    videoId:      r.video_id,
    title:        r.title,
    thumbnail:    r.thumbnail,
    channelTitle: r.channel_title ?? '',
    duration:     r.duration ?? 0,
    category:     r.category ?? 'trending',
    fetchedAt:    r.fetched_at ?? '',
  }));
}
