import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Official Instagram oEmbed (instagram_oembed) — the sanctioned replacement for
// scraping the public page for a reel's title/thumbnail/author. The app secret stays
// server-side: the client calls this fn, which calls Meta with the app access token.
// Requires the "oEmbed Read" feature on the Meta app + IG_OEMBED_TOKEN edge secret
// (an app access token, i.e. "{APP_ID}|{APP_SECRET}", or a long-lived app token).
const OEMBED_TOKEN = (Deno.env.get("IG_OEMBED_TOKEN") ?? "").trim();
const GRAPH_VERSION = "v19.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    if (!OEMBED_TOKEN) { return json({ error: "oEmbed not configured" }, 500); }

    const { url } = await req.json().catch(() => ({}));
    if (!url || typeof url !== "string") { return json({ error: "url required" }, 400); }
    // Only proxy real Instagram post/reel URLs — never an arbitrary fetch target.
    if (!/^https:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\/[A-Za-z0-9_-]+/.test(url)) {
      return json({ error: "not an instagram url" }, 400);
    }

    const api = `https://graph.facebook.com/${GRAPH_VERSION}/instagram_oembed`
      + `?url=${encodeURIComponent(url)}`
      + `&omitscript=true`
      + `&fields=author_name,thumbnail_url,title`
      + `&access_token=${encodeURIComponent(OEMBED_TOKEN)}`;

    const res = await fetch(api);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json({ error: data?.error?.message ?? "oembed failed", status: res.status }, 502);
    }

    return json({
      ok: true,
      title: data.title ?? null,           // caption (often absent — that's fine)
      thumbnail: data.thumbnail_url ?? null,
      author: data.author_name ?? null,
    });
  } catch (e: any) {
    console.error("[instagram-oembed]", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
