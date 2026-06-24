import {
  buildAuthUrl,
  parseOAuthDeepLink,
  REDIRECT_URI,
  GOOGLE_CLIENT_ID,
  TIKTOK_CLIENT_KEY,
  INSTAGRAM_APP_ID,
  FACEBOOK_APP_ID,
  FACEBOOK_GRAPH_VERSION,
} from './config';

// Pure-logic coverage for the OAuth connect URLs (A5/A7) and the deep-link return
// parsing (A6/I5). These don't need a device or live secrets — they assert the URLs
// and state round-trip the app builds, so a console/redirect change is caught in CI.

describe('buildAuthUrl', () => {
  it('builds a Google/YouTube consent URL with offline access', () => {
    const { url, state } = buildAuthUrl('youtube', 'creator');
    expect(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true);
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('client_id')).toBe(GOOGLE_CLIENT_ID);
    expect(q.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('prompt')).toBe('consent');
    expect(q.get('scope')).toContain('youtube.readonly');
    expect(q.get('state')).toBe(state);
    expect(state.startsWith('youtube.creator.')).toBe(true);
  });

  it('builds an Instagram authorize URL', () => {
    const { url } = buildAuthUrl('instagram');
    expect(url.startsWith('https://www.instagram.com/oauth/authorize?')).toBe(true);
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('client_id')).toBe(INSTAGRAM_APP_ID);
    expect(q.get('scope')).toBe('instagram_business_basic');
  });

  it('builds a Facebook dialog URL pinned to the graph version with rerequest', () => {
    const { url } = buildAuthUrl('facebook');
    expect(url.startsWith(`https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth?`)).toBe(true);
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('client_id')).toBe(FACEBOOK_APP_ID);
    expect(q.get('auth_type')).toBe('rerequest');
    expect(q.get('scope')).toContain('pages_show_list');
  });

  it('builds a TikTok authorize URL with client_key (not client_id)', () => {
    const { url } = buildAuthUrl('tiktok');
    expect(url.startsWith('https://www.tiktok.com/v2/auth/authorize/?')).toBe(true);
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('client_key')).toBe(TIKTOK_CLIENT_KEY);
    expect(q.get('client_id')).toBeNull();
    expect(q.get('scope')).toBe('user.info.basic,video.list');
  });

  it('encodes the connection type into state for the feed flow', () => {
    const { state } = buildAuthUrl('youtube', 'feed');
    expect(state.startsWith('youtube.feed.')).toBe(true);
  });

  it('every provider redirects to the single registered REDIRECT_URI', () => {
    (['youtube', 'tiktok', 'instagram', 'facebook'] as const).forEach((p) => {
      const q = new URLSearchParams(buildAuthUrl(p).url.split('?')[1]);
      expect(q.get('redirect_uri')).toBe(REDIRECT_URI);
    });
  });
});

describe('parseOAuthDeepLink', () => {
  it('returns null for a non-oauth deep link', () => {
    expect(parseOAuthDeepLink('reaxn://reaction/abc')).toBeNull();
    expect(parseOAuthDeepLink('https://example.com')).toBeNull();
    expect(parseOAuthDeepLink('reaxn://oauth')).toBeNull(); // no query
  });

  it('parses a successful return with provider + connection type from state', () => {
    const r = parseOAuthDeepLink('reaxn://oauth?code=AUTH_CODE&state=instagram.creator.42');
    expect(r).toEqual({
      provider: 'instagram',
      connectionType: 'creator',
      code: 'AUTH_CODE',
      error: null,
    });
  });

  it('surfaces a human-readable error and prefers error_description', () => {
    const r = parseOAuthDeepLink(
      'reaxn://oauth?error=access_denied&error_description=User%20cancelled&state=facebook.creator.7',
    );
    expect(r?.code).toBeNull();
    expect(r?.error).toBe('User cancelled');
    expect(r?.provider).toBe('facebook');
  });

  it('falls back to the raw error when no description is present', () => {
    const r = parseOAuthDeepLink('reaxn://oauth?error=invalid_scope&state=tiktok.feed.1');
    expect(r?.error).toBe('invalid_scope');
    expect(r?.connectionType).toBe('feed');
  });

  it('defaults provider to youtube and type to creator for a legacy/short state', () => {
    const r = parseOAuthDeepLink('reaxn://oauth?code=X&state=999');
    expect(r?.provider).toBe('youtube');
    expect(r?.connectionType).toBe('creator');
  });

  it('returns null when neither code nor error is present', () => {
    expect(parseOAuthDeepLink('reaxn://oauth?state=youtube.creator.1')).toBeNull();
  });
});
