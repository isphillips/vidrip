import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APNS_AUTH_KEY = Deno.env.get('APNS_AUTH_KEY')!;       // .p8 key contents
const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID')!;           // 10-char key ID
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID')!;         // 10-char team ID
const APNS_BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID')!;     // com.yourco.reaxn
const APNS_ENV = Deno.env.get('APNS_ENV') ?? 'sandbox';     // 'sandbox' | 'production'
const INTERNAL_SECRET = Deno.env.get('INTERNAL_SECRET')!;   // shared with DB trigger
// Full Firebase service-account JSON (single env var). Generate in:
// Firebase Console -> Project settings -> Service accounts -> Generate new private key.
const FCM_SERVICE_ACCOUNT = Deno.env.get('FCM_SERVICE_ACCOUNT');

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Shared helpers ─────────────────────────────────────────────────────────────

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function encodeJson(obj: object): string {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)));
}

// FCM data payloads must be a flat map of string values — drop undefined, stringify.
function toStringData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null) { out[k] = String(v); }
  }
  return out;
}

// ── APNs (iOS) ─────────────────────────────────────────────────────────────────

async function buildApnsJwt(): Promise<string> {
  const pemContents = APNS_AUTH_KEY
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const header = encodeJson({ alg: 'ES256', kid: APNS_KEY_ID });
  const payload = encodeJson({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) });
  const unsigned = `${header}.${payload}`;

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned),
  );

  return `${unsigned}.${base64url(new Uint8Array(sig))}`;
}

async function sendApns(deviceToken: string, title: string, body: string, data: object): Promise<boolean> {
  const jwt = await buildApnsJwt();
  const body0 = JSON.stringify({
    aps: { alert: { title, body }, sound: 'default', badge: 1 },
    ...data,
  });

  // A device token is valid for exactly ONE environment (sandbox for debug
  // builds, production for TestFlight/App Store). We don't know which a given
  // token is, so try the configured env first and fall back to the other on
  // BadDeviceToken — self-heals across build types.
  const hosts = APNS_ENV === 'production'
    ? ['api.push.apple.com', 'api.sandbox.push.apple.com']
    : ['api.sandbox.push.apple.com', 'api.push.apple.com'];

  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];
    const res = await fetch(`https://${host}/3/device/${deviceToken}`, {
      method: 'POST',
      headers: {
        'apns-topic': APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'authorization': `bearer ${jwt}`,
        'content-type': 'application/json',
      },
      body: body0,
    });
    if (res.ok) { return true; }
    const text = await res.text();
    if (res.status === 400 && text.includes('BadDeviceToken') && i < hosts.length - 1) {
      console.log(`[send-push] APNs BadDeviceToken on ${host}; retrying other environment`);
      continue;
    }
    console.error(`APNs error ${res.status} (${host}):`, text);
    return false;
  }
  return false;
}

// ── FCM (Android) ──────────────────────────────────────────────────────────────

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri: string;
}

let _sa: ServiceAccount | null | undefined;
function getServiceAccount(): ServiceAccount | null {
  if (_sa !== undefined) { return _sa; }
  if (!FCM_SERVICE_ACCOUNT) { _sa = null; return _sa; }
  try {
    _sa = JSON.parse(FCM_SERVICE_ACCOUNT) as ServiceAccount;
  } catch (e) {
    console.error('[send-push] FCM_SERVICE_ACCOUNT is not valid JSON:', e);
    _sa = null;
  }
  return _sa;
}

// Google OAuth2 access token, cached for the life of the (warm) function instance.
let _fcmToken: { token: string; exp: number } | null = null;

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_fcmToken && _fcmToken.exp > now + 60) { return _fcmToken.token; }

  const header = encodeJson({ alg: 'RS256', typ: 'JWT' });
  const claim = encodeJson({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${claim}`;

  // Service-account private_key is PKCS#8 PEM (RS256). After JSON.parse the
  // \n escapes become real newlines, which the \s strip handles.
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64url(new Uint8Array(sig))}`;

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!res.ok) { throw new Error(`FCM token exchange failed: ${JSON.stringify(json)}`); }
  _fcmToken = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return _fcmToken.token;
}

async function sendFcm(
  sa: ServiceAccount,
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<boolean> {
  const accessToken = await getFcmAccessToken(sa);
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          // `notification` makes Android auto-display the banner when backgrounded;
          // `data` carries the routing payload the app reads on tap.
          notification: { title, body },
          data,
          android: { priority: 'high', notification: { sound: 'default' } },
        },
      }),
    },
  );
  if (!res.ok) {
    console.error(`FCM error ${res.status}:`, await res.text());
  }
  return res.ok;
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Verify the call came from our own DB trigger, not an outside caller
  if (req.headers.get('x-internal-secret') !== INTERNAL_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { user_id, title, body, thread_id, channel_id, post_id, channel_name, type, award_id, collection_id } = await req.json();
  if (!user_id || !title || !body) {
    return new Response('Missing fields', { status: 400 });
  }

  // A user may have more than one device (e.g. iOS + Android). Send to each.
  const { data: tokenRows } = await db
    .from('device_tokens')
    .select('token, platform')
    .eq('user_id', user_id);

  if (!tokenRows || tokenRows.length === 0) {
    return new Response('No token for user', { status: 200 });
  }

  // Build notification data — award (gift reveal), channel, or thread.
  const data = type === 'award'
    ? { type: 'award', award_id, collection_id, channel_name }
    : channel_id
      ? { channel_id, post_id, channel_name }
      : { thread_id };
  const fcmData = toStringData(data);

  const results: { platform: string; ok: boolean }[] = [];
  for (const row of tokenRows) {
    if (row.platform === 'android') {
      const sa = getServiceAccount();
      if (!sa) {
        console.error('[send-push] FCM_SERVICE_ACCOUNT not configured; skipping android token');
        results.push({ platform: 'android', ok: false });
        continue;
      }
      console.log(`[send-push] FCM -> user_id=${user_id} title="${title}"`);
      results.push({ platform: 'android', ok: await sendFcm(sa, row.token, title, body, fcmData) });
    } else {
      console.log(`[send-push] APNs -> user_id=${user_id} title="${title}"`);
      results.push({ platform: 'ios', ok: await sendApns(row.token, title, body, data) });
    }
  }

  console.log(`[send-push] results: ${JSON.stringify(results)}`);
  return new Response(JSON.stringify({ ok: results.some(r => r.ok), results }), {
    headers: { 'content-type': 'application/json' },
  });
});
