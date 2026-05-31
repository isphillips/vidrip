import isoduration from "iso8601-duration";

// console.cloud.google.com → enable "YouTube Data API v3" → Create credentials → API key
// Restricted to YouTube Data API v3 only.
const YT_API_KEY = 'AIzaSyDLDIXq-1wC4nbV9rdJLZlbSxOvnHnZrHw';
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

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
