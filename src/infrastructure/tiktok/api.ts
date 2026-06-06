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

/**
 * Resolve a TikTok short link (vm.tiktok.com/..., tiktok.com/t/...) to its
 * canonical URL by following the redirect, then extract the id.
 * Returns null if it can't be resolved.
 */
export async function resolveTikTokShortLink(shortUrl: string): Promise<string | null> {
  try {
    const res = await fetch(shortUrl, { method: 'HEAD', redirect: 'follow' });
    return extractTikTokId(res.url);
  } catch {
    return null;
  }
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

/** The embed Player API iframe URL for a given post id. */
export function tikTokPlayerUrl(
  postId: string,
  opts: { controls?: boolean; autoplay?: boolean } = {},
): string {
  const params = new URLSearchParams({
    controls: opts.controls === false ? '0' : '1',
    autoplay: opts.autoplay ? '1' : '0',
    loop: '0',
    rel: '0',
    music_info: '0',
    description: '0',
    native_context_menu: '0',
    closed_caption: '0',
  });
  return `https://www.tiktok.com/player/v1/${postId}?${params.toString()}`;
}
