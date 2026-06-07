import { supabase } from '../client';

export type ShortRow = {
  videoId:      string;
  title:        string;
  thumbnail:    string;
  channelTitle: string;
  duration:     number;
  category:     string;
  fetchedAt:    string;   // recency axis for interleaving with member videos
};

function mapRow(r: any): ShortRow {
  return {
    videoId:      r.video_id,
    title:        r.title,
    thumbnail:    r.thumbnail,
    channelTitle: r.channel ?? '',
    duration:     r.duration,
    category:     r.category,
    fetchedAt:    r.fetched_at ?? '',
  };
}

export async function fetchShorts(
  category?: string,
  limit = 50,
  offset = 0,
): Promise<ShortRow[]> {
  let q = (supabase as any)
    .from('shorts')
    .select('video_id, title, thumbnail, channel, duration, category, fetched_at')
    .order('fetched_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category && category !== 'all') {
    q = q.eq('category', category);
  }

  const { data, error } = await q;
  if (error) { throw error; }
  return (data ?? []).map(mapRow);
}

export async function searchShorts(query: string, limit = 50): Promise<ShortRow[]> {
  const { data, error } = await (supabase as any)
    .from('shorts')
    .select('video_id, title, thumbnail, channel, duration, category, fetched_at')
    .ilike('title', `%${query}%`)
    .order('fetched_at', { ascending: false })
    .limit(limit);

  if (error) { throw error; }
  return (data ?? []).map(mapRow);
}

export const CATEGORIES = ['all', 'latest', 'trending', 'music', 'gaming', 'funny', 'food', 'sports', 'dance', 'comedy'] as const;
export type Category = typeof CATEGORIES[number];
