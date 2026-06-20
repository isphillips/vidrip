import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Title / thumbnail / author for a pasted public Instagram Reel. The app secret stays server-side.
//
// Two sources, merged best-effort (so a missing token or a thin oEmbed response still yields a
// thumbnail):
//   1. Official Instagram oEmbed (instagram_oembed) — needs the "oEmbed Read" feature on the Meta app
//      + IG_OEMBED_TOKEN ("{APP_ID}|{APP_SECRET}" or a long-lived app token). Often returns the caption
//      + author but NO thumbnail for reels.
//   2. Open Graph scrape — Instagram serves og:image / og:title / og:description to the Facebook
//      crawler UA, so we read them directly. Needs no token and is what reliably gives the thumbnail.
const OEMBED_TOKEN = (Deno.env.get("IG_OEMBED_TOKEN") ?? "").trim();
const GRAPH_VERSION = "v19.0";
// Instagram whitelists Facebook's link-preview crawler to receive Open Graph tags on public posts.
const CRAWLER_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// Decode the handful of HTML entities that show up in og: tag content (notably &amp; in image URLs).
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Pull one <meta property|name="<prop>" content="..."> value (either attribute order).
function metaTag(html: string, prop: string): string | null {
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"));
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i"));
  const v = (a?.[1] ?? b?.[1] ?? "").trim();
  return v ? decodeEntities(v) : null;
}

// og:description on IG looks like: `12,345 likes, 67 comments - username on Instagram: "the caption".`
// Pull just the quoted caption when present; otherwise null.
function captionFromDescription(desc: string | null): string | null {
  if (!desc) { return null; }
  const m = desc.match(/[:\-]\s*["“”'](.+?)["“”']\s*\.?\s*$/);
  return m ? m[1].trim() : null;
}

// og:title on IG is usually `Username on Instagram` (or `Username (@handle) • Instagram`). Strip the
// trailing " on Instagram" / " • Instagram" to recover the username.
function authorFromTitle(title: string | null): string | null {
  if (!title) { return null; }
  const m = title.match(/^(.+?)\s*(?:on Instagram|•\s*Instagram|\(@)/i);
  return (m?.[1] ?? title).trim() || null;
}

async function fetchOembed(url: string) {
  if (!OEMBED_TOKEN) { return { title: null, thumbnail: null, author: null }; }
  try {
    const api = `https://graph.facebook.com/${GRAPH_VERSION}/instagram_oembed`
      + `?url=${encodeURIComponent(url)}&omitscript=true`
      + `&fields=author_name,thumbnail_url,title`
      + `&access_token=${encodeURIComponent(OEMBED_TOKEN)}`;
    const res = await fetch(api);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { return { title: null, thumbnail: null, author: null }; }
    return {
      title: (data.title ?? null) as string | null,
      thumbnail: (data.thumbnail_url ?? null) as string | null,
      author: (data.author_name ?? null) as string | null,
    };
  } catch {
    return { title: null, thumbnail: null, author: null };
  }
}

async function scrapeOg(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": CRAWLER_UA, "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
    });
    if (!res.ok) { return { title: null, thumbnail: null, author: null }; }
    const html = await res.text();
    const ogTitle = metaTag(html, "og:title");
    const ogDesc = metaTag(html, "og:description");
    const ogImage = metaTag(html, "og:image:secure_url") ?? metaTag(html, "og:image");
    return {
      title: captionFromDescription(ogDesc) ?? ogTitle,
      thumbnail: ogImage,
      author: authorFromTitle(ogTitle),
    };
  } catch {
    return { title: null, thumbnail: null, author: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { url } = await req.json().catch(() => ({}));
    if (!url || typeof url !== "string") { return json({ error: "url required" }, 400); }
    // Only proxy real Instagram post/reel URLs — never an arbitrary fetch target.
    if (!/^https:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\/[A-Za-z0-9_-]+/.test(url)) {
      return json({ error: "not an instagram url" }, 400);
    }

    // Try both sources; oEmbed wins for caption/author, the scrape wins for the thumbnail.
    const [oembed, scraped] = await Promise.all([fetchOembed(url), scrapeOg(url)]);
    const title = oembed.title || scraped.title || null;
    const thumbnail = oembed.thumbnail || scraped.thumbnail || null;
    const author = oembed.author || scraped.author || null;

    if (!title && !thumbnail && !author) {
      // Login-walled / private / removed → let the client fall back to its defaults.
      return json({ ok: false, error: "no metadata available" });
    }
    return json({ ok: true, title, thumbnail, author });
  } catch (e: any) {
    console.error("[instagram-oembed]", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
