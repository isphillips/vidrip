// OAuth config for syncing creator accounts. Only PUBLIC client ids live here
// (safe in the app). Client secrets live in the sync-oauth edge function env.

export type SyncProvider = 'youtube' | 'tiktok' | 'instagram';

// 'creator' = opens a Members Only channel from the account's uploads.
// 'feed'    = pulls the user's personal feed (e.g. Liked Videos) into "For You".
export type ConnectionType = 'creator' | 'feed';

// TikTok/Google require an https redirect (custom schemes rejected). The app's
// OAuth WebView intercepts navigation to this URL to extract the code — it
// never actually loads, so the URL only needs to be registered, not served.
// Register this exact value in BOTH the TikTok and Google consoles.
export const REDIRECT_URI =
  'https://ltpscwticavqutbzrrjb.supabase.co/functions/v1/oauth-callback';

// TODO: fill from Google Cloud Console (OAuth 2.0 Client ID, iOS/Web).
export const GOOGLE_CLIENT_ID = '1028980678970-ea99v2h8kmli81rangil85dfqoqui459.apps.googleusercontent.com';
// TODO: fill from TikTok developer portal (Client key).
export const TIKTOK_CLIENT_KEY = 'sbawbp2z1skyo0obdt';
// Instagram App ID (public) for "Instagram API with Instagram Login" — the creator
// signs in with Instagram directly, no Facebook Page required. The app secret lives
// in the sync-oauth edge function env.
export const INSTAGRAM_APP_ID = '1354410146587874';

const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const TIKTOK_SCOPE = 'user.info.basic,user.info.profile,video.list';
// Instagram API with Instagram Login — read the creator's own profile + media
// (Reels) straight from their Instagram Business/Creator account.
const INSTAGRAM_SCOPE = 'instagram_business_basic';

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
    parts[0] === 'tiktok' ? 'tiktok' : parts[0] === 'instagram' ? 'instagram' : 'youtube';
  const connectionType: ConnectionType = parts[1] === 'feed' ? 'feed' : 'creator';
  return {
    provider,
    connectionType,
    code: code ?? null,
    error: error ? (errorDescription || error) : null,
  };
}
