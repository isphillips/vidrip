import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Meta "Data Deletion Request" callback. When a user removes the app, Meta POSTs a
// form-encoded `signed_request` (HMAC-SHA256 over the payload, keyed by the app secret;
// payload carries the app-scoped `user_id`). We verify it, delete every trace of data we
// obtained from Meta for that account, record the request, and return the required
// { url, confirmation_code } JSON so the user can check status. Public endpoint — deploy
// with `--no-verify-jwt` (Meta sends no JWT).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Same app secrets sync-oauth already uses — verifying against both covers a single
// shared IG/FB Meta app or two separate apps pointing at this one callback.
const INSTAGRAM_APP_SECRET = (Deno.env.get("INSTAGRAM_APP_SECRET") ?? "").trim();
const FACEBOOK_APP_SECRET = (Deno.env.get("FACEBOOK_APP_SECRET") ?? "").trim();

// Branded page where the user can check deletion status (Cloudflare Pages on vidrip.app).
const STATUS_BASE = "https://vidrip.app/data-deletion";

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) { s += "="; }
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) { return false; }
  let r = 0;
  for (let i = 0; i < a.length; i++) { r |= a[i] ^ b[i]; }
  return r === 0; // constant-time-ish compare
}

// Verify a Meta signed_request (`<sig>.<payload>`) and return its decoded payload, or null.
async function verifySignedRequest(signed: string, secret: string): Promise<{ user_id?: string } | null> {
  if (!secret) { return null; }
  const dot = signed.indexOf(".");
  if (dot < 0) { return null; }
  const encSig = signed.slice(0, dot);
  const encPayload = signed.slice(dot + 1);
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encPayload)));
    if (!bytesEqual(expected, b64urlToBytes(encSig))) { return null; }
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(encPayload)));
  } catch {
    return null;
  }
}

type Admin = ReturnType<typeof createClient>;

// Delete everything obtained from Meta for one connected account: imported reels
// (channel_posts) + their re-hosted media in Storage, the cached feed, and the synced
// account row (cascades its tokens). Best-effort per step — the user removed the app,
// so we remove as much as we can rather than aborting on the first error.
async function deleteMetaData(admin: Admin, vidripUserId: string, provider: string) {
  // Imported reels: channel_posts(poster_id = user, source_type = provider). Re-hosted
  // media lives at channel-clips/{provider}/{channelId}/<mediaId>.{mp4,jpg}.
  const { data: posts } = await admin.from("channel_posts")
    .select("channel_id").eq("poster_id", vidripUserId).eq("source_type", provider);
  const channelIds = [...new Set((posts ?? []).map((p: { channel_id: string }) => p.channel_id).filter(Boolean))];

  for (const channelId of channelIds) {
    const prefix = `${provider}/${channelId}`;
    const { data: files } = await admin.storage.from("channel-clips").list(prefix, { limit: 1000 });
    if (files && files.length) {
      await admin.storage.from("channel-clips").remove(files.map((f: { name: string }) => `${prefix}/${f.name}`));
    }
  }

  await admin.from("channel_posts").delete().eq("poster_id", vidripUserId).eq("source_type", provider);
  await admin.from("connected_feed_items").delete().eq("user_id", vidripUserId).eq("provider", provider);
  await admin.from("synced_accounts").delete().eq("user_id", vidripUserId).eq("provider", provider);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") { return new Response("Method Not Allowed", { status: 405 }); }
  try {
    // Meta sends application/x-www-form-urlencoded with a single `signed_request` field.
    const form = await req.formData();
    const signed = String(form.get("signed_request") ?? "");
    if (!signed) { return new Response("Missing signed_request", { status: 400 }); }

    const payload =
      (await verifySignedRequest(signed, INSTAGRAM_APP_SECRET)) ??
      (await verifySignedRequest(signed, FACEBOOK_APP_SECRET));
    if (!payload?.user_id) { return new Response("Bad signed_request", { status: 400 }); }
    const metaUserId = String(payload.user_id);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // The Meta user id maps to synced_accounts.provider_account_id (true for Instagram
    // Login). Delete whatever matches across both providers; dedupe by user+provider.
    const { data: accounts } = await admin.from("synced_accounts")
      .select("user_id, provider")
      .in("provider", ["instagram", "facebook"])
      .eq("provider_account_id", metaUserId);

    const matched = (accounts ?? []) as { user_id: string; provider: string }[];
    const seen = new Set<string>();
    for (const a of matched) {
      const k = `${a.user_id}:${a.provider}`;
      if (seen.has(k)) { continue; }
      seen.add(k);
      await deleteMetaData(admin, a.user_id, a.provider);
    }

    // Record the request (audit + status page lookup). status is 'completed' because the
    // deletion above runs synchronously before we respond.
    const confirmationCode = crypto.randomUUID().replace(/-/g, "");
    await admin.from("data_deletion_requests").insert({
      confirmation_code: confirmationCode,
      meta_user_id: metaUserId,
      provider: [...seen].map(k => k.split(":")[1]).join(",") || null,
      status: "completed",
    });

    return new Response(JSON.stringify({
      url: `${STATUS_BASE}?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[meta-data-deletion]", e);
    return new Response("Internal Error", { status: 500 });
  }
});
