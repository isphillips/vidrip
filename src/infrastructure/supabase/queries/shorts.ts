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
  // RPC applies channel round-robin so a creator's batch-ingested uploads don't
  // cluster (plain order-by-fetched_at clusters them). Returns rows shaped like the
  // table select below — mapRow keys are the same.
  const { data, error } = await (supabase as any).rpc('fetch_category_shorts', {
    p_category: category && category !== 'all' ? category : 'all',
    p_limit: limit,
    p_offset: offset,
  });
  if (error) { throw error; }
  return (data ?? []).map((r: any) => ({
    videoId:      r.video_id,
    title:        r.title,
    thumbnail:    r.thumbnail,
    channelTitle: r.channel_title ?? '',
    duration:     r.duration ?? 0,
    category:     r.category,
    fetchedAt:    r.fetched_at ?? '',
  }));
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

export const CATEGORIES = ['latest', 'trending', 'music', 'gaming', 'funny', 'sports', 'news', 'pets', 'cars'] as const;
export type Category = typeof CATEGORIES[number];

// Display names for the category pills. Edit these freely — they're UI-only; the
// keys above stay the stable values used for fetching/storage, so changing a label
// here never touches the backend.
export const CATEGORY_LABELS: Record<Category, string> = {
  latest: 'Latest',
  trending: 'Trending',
  music: 'Music',
  gaming: 'Gaming',
  funny: 'Comedy',
  sports: 'Sports',
  news: 'News & Politics',
  pets: 'Pets & Animals',
  cars: 'Cars & Vehicles',
};

export function categoryLabel(cat: Category): string {
  return CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}
