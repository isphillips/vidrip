import { parse, toSeconds } from "iso8601-duration";

// console.cloud.google.com → enable "YouTube Data API v3" → Create credentials → API key
// Restricted to YouTube Data API v3 only.
const YT_API_KEY = 'AIzaSyDLDIXq-1wC4nbV9rdJLZlbSxOvnHnZrHw';
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

/** Max shareable video length (seconds). Videos longer than this are rejected. */
export const MAX_VIDEO_SECONDS = 180;

/**
 * Real video length in seconds via the YouTube Data API (contentDetails.duration
 * is ISO-8601, e.g. "PT2M59S"). Returns null if it can't be determined (bad id,
 * private video, network/quota error) — callers treat null as "unknown", not "too long".
 */
export async function fetchYouTubeDurationSeconds(videoId: string): Promise<number | null> {
  try {
    const res = await fetch(`${YT_BASE}/videos?part=contentDetails&id=${videoId}&key=${YT_API_KEY}`);
    if (!res.ok) { return null; }
    const json = await res.json();
    const iso = json.items?.[0]?.contentDetails?.duration;
    if (!iso) { return null; }
    return Math.round(toSeconds(parse(iso)));
  } catch {
    return null;
  }
}

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

export async function fetchTrendingShorts(
  maxResults = 20,
  pageToken?: string,
): Promise<PagedShorts> {
  const page = pageToken ? `&pageToken=${pageToken}` : '';
  const res = await fetch(
    `${YT_BASE}/videos?part=snippet&chart=mostPopular&videoDuration=short&maxResults=${maxResults}${page}&key=${YT_API_KEY}`,
  );
  const json = await res.json();
  return {
    items: (json.items ?? []).map((item: any) => ({
      videoId: item.id,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.high?.url
        ?? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
    })),
    nextPageToken: json.nextPageToken,
  };
}

export async function searchShorts(
  query: string,
  maxResults = 20,
  pageToken?: string,
): Promise<PagedShorts> {
  const q = encodeURIComponent(`${query} #shorts`);
  const page = pageToken ? `&pageToken=${pageToken}` : '';
  const res = await fetch(
    `${YT_BASE}/search?part=snippet&q=${q}&type=video&videoDuration=short&maxResults=${maxResults}${page}&key=${YT_API_KEY}`,
  );
  const json = await res.json();
  return {
    items: (json.items ?? []).map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.high?.url
        ?? `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
    })),
    nextPageToken: json.nextPageToken,
  };
}
