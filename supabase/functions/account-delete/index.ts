import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Self-service account deletion (mirrors the web account portal). Re-auths the caller,
// immediately hard-deletes their synced accounts + re-hosted external media, then stamps
// a 30-day grace before platform data is purged by purge_pending_deletions() (migration
// 0006). Actions: 'request' (default), 'send-otp', 'cancel'.

// All three are auto-injected into edge functions by the platform.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
function res(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    // Anon client: verifies the caller's OWN credentials during re-auth (never bypasses RLS).
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // The platform (verify_jwt=true) already validated signature + expiry; we decode the
    // claims we need: sub (user id) and aal (assurance level — aal2 once TOTP is passed).
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let userId = "";
    let aal = "";
    try {
      const payload = JSON.parse(atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.role === "authenticated" && typeof payload.sub === "string") { userId = payload.sub; }
      aal = typeof payload.aal === "string" ? payload.aal : "";
    } catch { /* malformed token */ }
    if (!userId) { return res({ error: "unauthorized" }, 401); }

    const { action, password, otp } = await req.json().catch(() => ({}));

    // Email + whether the account has a verified authenticator (drives re-auth).
    const { data: u, error: uErr } = await admin.auth.admin.getUserById(userId);
    if (uErr || !u.user) { return res({ error: "User not found" }, 404); }
    const email = u.user.email ?? "";
    const factors = (u.user.factors ?? []) as { factor_type?: string; status?: string }[];
    const hasTotp = factors.some((f) => f.factor_type === "totp" && f.status === "verified");

    // ── send-otp: email a confirmation code (no-TOTP accounts only) ──
    if (action === "send-otp") {
      if (hasTotp) { return res({ error: "This account uses an authenticator app — confirm with your code and password instead." }, 400); }
      if (!email) { return res({ error: "No email on file for this account." }, 400); }
      const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (error) { return res({ error: "Could not send the confirmation code." }, 500); }
      return res({ ok: true });
    }

    // ── cancel: clear a pending deletion within the grace window ──
    if (action === "cancel") {
      const { error } = await admin.from("users").update({ deletion_requested_at: null }).eq("id", userId);
      if (error) { return res({ error: "Could not cancel the deletion." }, 500); }
      return res({ ok: true });
    }

    // ── request (default): re-auth, purge external data, schedule the grace purge ──
    if (hasTotp) {
      if (aal !== "aal2") { return res({ error: "Verify your authenticator code first." }, 401); }
      if (!password) { return res({ error: "Enter your password to confirm." }, 400); }
      const { error } = await anon.auth.signInWithPassword({ email, password });
      if (error) { return res({ error: "Incorrect password." }, 401); }
    } else {
      if (!otp) { return res({ error: "Enter the emailed confirmation code." }, 400); }
      const { error } = await anon.auth.verifyOtp({ email, token: String(otp).trim(), type: "email" });
      if (error) { return res({ error: "Invalid or expired code." }, 401); }
    }

    // 1. Immediately + irreversibly remove synced accounts and re-hosted external media.
    const { data: channels } = await admin.from("groups").select("id").eq("created_by", userId);
    for (const ch of (channels ?? []) as { id: string }[]) {
      for (const provider of ["instagram", "facebook"]) {
        const prefix = `${provider}/${ch.id}`;
        const { data: files } = await admin.storage.from("channel-clips").list(prefix, { limit: 1000 });
        if (files && files.length) {
          await admin.storage.from("channel-clips").remove(files.map((f) => `${prefix}/${f.name}`));
        }
      }
    }
    await admin.from("synced_accounts").delete().eq("user_id", userId);

    // 2. Stamp the deletion — purge_pending_deletions() erases platform data after 30 days.
    const { error: upErr } = await admin.from("users")
      .update({ deletion_requested_at: new Date().toISOString() }).eq("id", userId);
    if (upErr) { return res({ error: "Could not schedule the deletion." }, 500); }

    return res({ ok: true, purgeAt: new Date(Date.now() + 30 * 86_400_000).toISOString() });
  } catch (e: any) {
    console.error("[account-delete]", e);
    return res({ error: e?.message ?? String(e) }, 500);
  }
});
