// ── Cloudflare R2 media config ──────────────────────────────────────────────────────
// Reaction / UGC media (reactions, channel clips, DM media, reviews, video comments, music)
// is being moved off Supabase Storage onto R2 to escape egress costs. See
// vidrip-web/docs/r2-migration.md for the full plan.
//
// R2_ENABLED is the single switch for the WRITE path: while false, uploads keep going to
// Supabase Storage exactly as before. Reads always handle BOTH Supabase and R2 URLs
// (dual-read), so this flag can be flipped on safely once the buckets are provisioned, the
// Pages Functions are deployed, and existing objects have been rclone'd over + URL-rewritten.

export const R2_ENABLED = true;

// Origin that serves the Cloudflare Pages Functions (the web app).
export const R2_API_BASE = 'https://www.vidrip.app';

// Public custom-domain base per PUBLIC bucket — must match wrangler.toml [vars].
export const R2_PUBLIC_BASE: Record<string, string> = {
  'channel-clips': 'https://clips.vidrip.app',
  'reviews': 'https://reviews.vidrip.app',
  'comment-videos': 'https://comments.vidrip.app',
  'music': 'https://music.vidrip.app',
};

// Private buckets (reactions) are stored as r2://<bucket>/<key> and resolved via /api/media/sign.
export const R2_PRIVATE_PREFIX = 'r2://';

/** Build the public URL for an object in a public R2 bucket. */
export function publicR2Url(bucket: string, key: string): string {
  const base = (R2_PUBLIC_BASE[bucket] ?? '').replace(/\/$/, '');
  return `${base}/${encodeURI(key)}`;
}

/** True if a stored URL points at R2 (private marker or any public custom domain). */
export function isR2Url(url: string | null | undefined): boolean {
  if (!url) { return false; }
  if (url.startsWith(R2_PRIVATE_PREFIX)) { return true; }
  return Object.values(R2_PUBLIC_BASE).some((base) => url.startsWith(base));
}
