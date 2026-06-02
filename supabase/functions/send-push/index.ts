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

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── APNs JWT ─────────────────────────────────────────────────────────────────

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function encodeJson(obj: object): string {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)));
}

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

// ── Send ─────────────────────────────────────────────────────────────────────

async function sendPush(deviceToken: string, title: string, body: string, data: object) {
  const jwt = await buildApnsJwt();
  const host = APNS_ENV === 'production'
    ? 'api.push.apple.com'
    : 'api.sandbox.push.apple.com';

  const res = await fetch(`https://${host}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      'apns-topic': APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'authorization': `bearer ${jwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: { alert: { title, body }, sound: 'default', badge: 1 },
      ...data,
    }),
  });

  if (!res.ok) {
    const reason = await res.text();
    console.error(`APNs error ${res.status}:`, reason);
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

  const { user_id, title, body, thread_id } = await req.json();
  if (!user_id || !title || !body) {
    return new Response('Missing fields', { status: 400 });
  }

  const { data: tokenRow } = await db
    .from('device_tokens')
    .select('token')
    .eq('user_id', user_id)
    .single();

  if (!tokenRow?.token) {
    return new Response('No token for user', { status: 200 });
  }

  const ok = await sendPush(tokenRow.token, title, body, { thread_id });
  return new Response(JSON.stringify({ ok }), {
    headers: { 'content-type': 'application/json' },
  });
});
