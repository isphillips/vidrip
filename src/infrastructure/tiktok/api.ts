// TikTok URL → post id, mirroring src/infrastructure/youtube/api.ts.
// The embed Player API (https://www.tiktok.com/player/v1/{id}) is driven by the
// numeric post id, e.g. 6718335390845095173 from
// https://www.tiktok.com/@scout2015/video/6718335390845095173

/**
 * Extract the numeric TikTok post id from a URL, a player URL, or a raw id.
 * Returns null for short links (vm.tiktok.com / tiktok.com/t/...) — those 302
 * to the canonical URL and must be resolved via resolveTikTokShortLink first.
 */
export function extractTikTokId(input: string): string | null {
  const url = input.trim();

  // Raw numeric id (TikTok ids are 18-19 digits).
  if (/^\d{8,25}$/.test(url)) {
    return url;
  }

  const patterns = [
    /tiktok\.com\/@[^/]+\/video\/(\d+)/i, // canonical web URL
    /tiktok\.com\/player\/v1\/(\d+)/i, // embed player URL
    /tiktok\.com\/v\/(\d+)/i, // legacy /v/ URL
    /[?&]item_id=(\d+)/i, // some share URLs
  ];

  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      return m[1];
    }
  }

  return null;
}

/** True for any TikTok URL (canonical, player, or a share short link). */
export function isTikTokUrl(input: string): boolean {
  return /tiktok\.com/i.test(input);
}

/**
 * True for TikTok share short links (tiktok.com/t/..., vm./vt.tiktok.com/...) that 302 to the
 * canonical URL — these have no id in the URL itself and must be resolved over the network.
 */
export function isTikTokShortLink(input: string): boolean {
  const u = input.trim();
  return /tiktok\.com\/t\//i.test(u) || /(?:vm|vt)\.tiktok\.com\//i.test(u);
}

/**
 * Resolve a TikTok short link to its canonical URL by following the redirect, then extract the id.
 * Tries HEAD first (cheap) and falls back to GET (some short links don't honour HEAD). Null if it
 * can't be resolved.
 */
export async function resolveTikTokShortLink(shortUrl: string): Promise<string | null> {
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const res = await fetch(shortUrl, { method, redirect: 'follow' });
      const id = extractTikTokId(res.url);
      if (id) { return id; }
    } catch { /* try the next method */ }
  }
  return null;
}

/**
 * Get the TikTok post id from any TikTok input: extracts it directly from a canonical/player URL or
 * raw id (sync), or resolves a short link over the network. Returns null if it's not a resolvable
 * TikTok video. Use this anywhere a user can paste a TikTok URL.
 */
export async function resolveTikTokId(input: string): Promise<string | null> {
  const direct = extractTikTokId(input);
  if (direct) { return direct; }
  if (isTikTokShortLink(input)) { return resolveTikTokShortLink(input.trim()); }
  return null;
}

/**
 * Best-effort metadata (title, author, thumbnail) via TikTok's public oEmbed.
 * Mirrors the YouTube oEmbed usage in the share/add-video screens.
 */
export async function fetchTikTokMeta(
  postId: string,
): Promise<{ title: string; author: string; thumbnail: string | null } | null> {
  try {
    const canonical = `https://www.tiktok.com/@tiktok/video/${postId}`;
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonical)}`,
    );
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return {
      title: data.title ?? '',
      author: data.author_name ?? '',
      thumbnail: data.thumbnail_url ?? null,
    };
  } catch {
    return null;
  }
}

// TikTok oEmbed thumbnails are signed CDN URLs with an `x-expires` token — once
// expired they 403, so a URL stored at post time goes dead. Resolve a fresh one by
// video id at render time instead, cached in-memory for the session.
const ttThumbCache = new Map<string, string>();

export async function resolveTikTokThumbnail(videoId: string): Promise<string | null> {
  if (ttThumbCache.has(videoId)) { return ttThumbCache.get(videoId)!; }
  const meta = await fetchTikTokMeta(videoId);
  if (meta?.thumbnail) { ttThumbCache.set(videoId, meta.thumbnail); return meta.thumbnail; }
  return null;
}

/** The embed Player API iframe URL for a given post id. */
export function tikTokPlayerUrl(
  postId: string,
  opts: { controls?: boolean; autoplay?: boolean } = {},
): string {
  // Player v1 only lets you hide chrome via these params (the iframe is
  // cross-origin, so it can't be styled). Strip everything optional; keep just a
  // play button when interactive controls are requested.
  const wantControls = opts.controls !== false;
  const params = new URLSearchParams({
    autoplay: opts.autoplay ? '1' : '0',
    loop: '0',
    rel: '0',                       // no "related videos" at the end
    music_info: '0',                // hide the spinning music disc + track
    description: '0',               // hide caption/description
    closed_caption: '0',
    native_context_menu: '0',
    progress_bar: '0',
    volume_control: '0',
    fullscreen_button: '0',
    timestamp: '0',
    controls: wantControls ? '1' : '0',
    play_button: wantControls ? '1' : '0',
  });
  return `https://www.tiktok.com/player/v1/${postId}?${params.toString()}`;
}
