import isoduration from "iso8601-duration";

// console.cloud.google.com → enable "YouTube Data API v3" → Create credentials → API key
// Restricted to YouTube Data API v3 only.
const YT_API_KEY = 'AIzaSyDLDIXq-1wC4nbV9rdJLZlbSxOvnHnZrHw';
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

// YouTube Shorts are <= 60 seconds. The Data API has no "Shorts only" filter
// (videoDuration=short means < 4 min), so we approximate by filtering on the
// actual duration from contentDetails.
const MAX_SHORT_SECONDS = 60;

export type ShortItem = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
};

export type PagedShorts = {
  items: ShortItem[];
  nextPageToken?: string;
};

// Returns the set of video IDs (from the given list) whose duration is <= 60s.
async function filterToShortDurations(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) { return new Set(); }
  // contentDetails accepts up to 50 IDs per call — one request covers a page.
  const res = await fetch(
    `${YT_BASE}/videos?part=contentDetails&id=${ids.join(',')}&key=${YT_API_KEY}`,
  );
  const json = await res.json();
  const shorts = new Set<string>();
  for (const item of json.items ?? []) {
    try {
      const seconds = isoduration.toSeconds(isoduration.parse(item.contentDetails.duration));
      if (seconds > 0 && seconds <= MAX_SHORT_SECONDS) { shorts.add(item.id); }
    } catch { /* skip unparseable durations */ }
  }
  return shorts;
}

// Shared search → duration-filter pipeline. The search endpoint doesn't return
// durations, so we do a second batched contentDetails lookup and keep only
// true Shorts (<= 60s).
async function searchAndFilterShorts(
  q: string,
  order: 'relevance' | 'viewCount',
  maxResults: number,
  pageToken?: string,
): Promise<PagedShorts> {
  const page = pageToken ? `&pageToken=${pageToken}` : '';
  const res = await fetch(
    `${YT_BASE}/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoDuration=short&order=${order}&maxResults=${maxResults}${page}&key=${YT_API_KEY}`,
  );
  const json = await res.json();
  const raw: ShortItem[] = (json.items ?? []).map((item: any) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails.high?.url
      ?? `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
  }));

  const shortIds = await filterToShortDurations(raw.map((r) => r.videoId));
  const items = raw.filter((r) => shortIds.has(r.videoId));

  return { items, nextPageToken: json.nextPageToken };
}

// "Trending" = most-viewed Shorts. chart=mostPopular can't filter to Shorts
// (videoDuration isn't supported there), so we search the #shorts tag by viewCount.
export async function fetchTrendingShorts(
  maxResults = 20,
  pageToken?: string,
): Promise<PagedShorts> {
  return searchAndFilterShorts('#shorts', 'viewCount', maxResults, pageToken);
}

export async function searchShorts(
  query: string,
  maxResults = 20,
  pageToken?: string,
): Promise<PagedShorts> {
  return searchAndFilterShorts(`${query} #shorts`, 'relevance', maxResults, pageToken);
}

// Validates a pasted URL is a YouTube Short and returns its video ID, or null.
// Only accepts /shorts/ links — regular watch?v= and youtu.be URLs are rejected.
export function extractShortId(url: string): string | null {
  const m = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Confirms a video ID is actually a Short (<= 60s). Used to validate pasted links.
export async function isShort(videoId: string): Promise<boolean> {
  const shorts = await filterToShortDurations([videoId]);
  return shorts.has(videoId);
}
