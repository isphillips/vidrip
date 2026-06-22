// OAuth config for syncing creator accounts. Only PUBLIC client ids live here
// (safe in the app). Client secrets live in the sync-oauth edge function env.

export type SyncProvider = 'youtube' | 'tiktok' | 'instagram' | 'facebook';

// 'creator' = opens a Members Only channel from the account's uploads.
// 'feed'    = pulls the user's personal feed (e.g. Liked Videos) into "For You".
export type ConnectionType = 'creator' | 'feed';

// Providers require an https redirect (custom schemes rejected) and block OAuth in embedded
// WebViews, so auth runs in the system browser and redirects here. This is a real endpoint —
// a Cloudflare Pages Function on vidrip.app (web/functions/api/oauth-callback.ts) that 302s
// back into the app via reaxn://. Served natively on vidrip.app (NOT proxied to Supabase,
// which is itself on Cloudflare and rejects the loop). Register this exact value in the
// Google + TikTok (+ Meta) consoles, and keep it in sync with sync-oauth's REDIRECT_URI.
export const REDIRECT_URI = 'https://vidrip.app/api/oauth-callback';
export const GOOGLE_CLIENT_ID = '571633447038-jf3jkapo7drtmfrefb2kut1etmh5pa05.apps.googleusercontent.com';
export const TIKTOK_CLIENT_KEY = 'sbawbp2z1skyo0obdt';
// Instagram App ID (public) for "Instagram API with Instagram Login" — the creator
// signs in with Instagram directly, no Facebook Page required. The app secret lives
// in the sync-oauth edge function env.
export const INSTAGRAM_APP_ID = '1354410146587874';
// Facebook App ID (public) for Facebook Login. Reels live on a Page, so the creator
// authorizes Page access and then picks which Page to import. App secret lives in the
// sync-oauth edge function env.
export const FACEBOOK_APP_ID = '1590496342638743';
// Graph API version pinned so a Meta-side default bump can't silently change behavior.
export const FACEBOOK_GRAPH_VERSION = 'v21.0';

const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
// Only user.info.basic + video.list. We deliberately omit user.info.profile: it solely
// (→ @handle), which display_name already covers — so dropping it keeps
// the TikTok app-review scope surface minimal.
const TIKTOK_SCOPE = 'user.info.basic,video.list';
// Instagram API with Instagram Login — read the creator's own profile + media
// (Reels) straight from their Instagram Business/Creator account.
const INSTAGRAM_SCOPE = 'instagram_business_basic';
// Facebook Login — list the user's Pages and read each Page's published content
// (reels). pages_show_list enumerates Pages; pages_read_engagement reads Page-owned
// media. Both require App Review + business verification for production access.
const FACEBOOK_SCOPE = 'pages_show_list,pages_read_engagement';

// One redirect URL serves both providers + connection types, so both are carried
// in `state` as `${provider}.${type}.${nonce}`.
function makeState(provider: SyncProvider, type: ConnectionType): string {
  return `${provider}.${type}.${Math.abs(Date.now() % 1000000)}`;
}

/** Build the provider's authorize URL to open in the OAuth WebView. */
export function buildAuthUrl(
  provider: SyncProvider,
  connectionType: ConnectionType = 'creator',
): { url: string; state: string } {
  const state = makeState(provider, connectionType);
  if (provider === 'youtube') {
    const p = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: YOUTUBE_SCOPE,
      access_type: 'offline', // get a refresh token
      prompt: 'consent',
      state,
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`, state };
  }
  if (provider === 'instagram') {
    // Instagram Login dialog — the creator authorizes their own Instagram account
    // directly (no Facebook Page). Returns ?code to REDIRECT_URI.
    const p = new URLSearchParams({
      client_id: INSTAGRAM_APP_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: INSTAGRAM_SCOPE,
      state,
    });
    return { url: `https://www.instagram.com/oauth/authorize?${p.toString()}`, state };
  }
  if (provider === 'facebook') {
    // Facebook Login dialog — the creator grants Page access; the app then lists
    // their Pages and imports the chosen Page's reels. Returns ?code to REDIRECT_URI.
    // auth_type=rerequest forces the granular Page-selection screen to re-appear on
    // reconnect (otherwise FB silently reuses the prior choice), so a creator can add
    // a Page they didn't grant the first time.
    const p = new URLSearchParams({
      client_id: FACEBOOK_APP_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: FACEBOOK_SCOPE,
      auth_type: 'rerequest',
      state,
    });
    return {
      url: `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth?${p.toString()}`,
      state,
    };
  }
  // tiktok
  const p = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: TIKTOK_SCOPE,
    state,
  });
  return { url: `https://www.tiktok.com/v2/auth/authorize/?${p.toString()}`, state };
}

/**
 * Parse the bounced `reaxn://oauth?...` deep link the oauth-callback edge function
 * sends back into the app. Returns null for non-oauth deep links. For an oauth
 * link it returns `code` on success or a human-readable `error` when the provider
 * rejected the request (e.g. unauthorized scope) — AccountScreen surfaces either.
 */
export function parseOAuthDeepLink(
  url: string,
): { provider: SyncProvider; connectionType: ConnectionType; code: string | null; error: string | null } | null {
  if (!url.startsWith('reaxn://oauth')) {
    return null;
  }
  const query = url.split('?')[1];
  if (!query) {
    return null;
  }
  const params = new URLSearchParams(query);
  const code = params.get('code');
  const error = params.get('error');
  const errorDescription = params.get('error_description');
  const state = params.get('state') ?? '';
  if (!code && !error) {
    return null;
  }
  // state = `${provider}.${type}.${nonce}` (older builds: `${provider}.${nonce}`).
  const parts = state.split('.');
  const provider: SyncProvider =
    parts[0] === 'tiktok' ? 'tiktok'
      : parts[0] === 'instagram' ? 'instagram'
      : parts[0] === 'facebook' ? 'facebook'
      : 'youtube';
  const connectionType: ConnectionType = parts[1] === 'feed' ? 'feed' : 'creator';
  return {
    provider,
    connectionType,
    code: code ?? null,
    error: error ? (errorDescription || error) : null,
  };
}
