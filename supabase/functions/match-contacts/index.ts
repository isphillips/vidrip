import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Privacy-safe contact matching for the "invite contacts" screen. The app sends SHA-256 hashes of its
// contacts' (normalized) emails — never the raw emails or any phone number. We hash every account's
// email the same way and return which hashes correspond to a Vidrip account, and which of those are
// already the caller's friends. Nothing about non-matching contacts is learned or retained.
//
// SCALE NOTE: this lists all auth users per call (fine for the invite-only beta). At scale, store an
// indexed `email_sha256` column and query it with `.in()` instead of listing + hashing every user.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const normEmail = (e: string) => e.trim().toLowerCase();
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Identify the caller from their validated JWT (verify_jwt=true gates this function).
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let userId = "";
    try {
      const payload = JSON.parse(atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.role === "authenticated" && typeof payload.sub === "string") { userId = payload.sub; }
    } catch { /* malformed */ }
    if (!userId) { return json({ error: "unauthorized" }, 401); }

    const { hashes } = (await req.json()) as { hashes?: string[] };
    if (!Array.isArray(hashes) || hashes.length === 0) { return json({ userHashes: [], friendHashes: [] }); }
    const wanted = new Set(hashes.map((h) => String(h).toLowerCase()));

    // hash -> userId for accounts whose email-hash was requested.
    const hashToUser = new Map<string, string>();
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) { throw error; }
      for (const u of data.users) {
        if (!u.email) { continue; }
        const h = await sha256Hex(normEmail(u.email));
        if (wanted.has(h)) { hashToUser.set(h, u.id); }
      }
      if (data.users.length < 1000) { break; }
      page++;
    }

    const userHashes = [...hashToUser.keys()];
    let friendHashes: string[] = [];
    if (hashToUser.size) {
      const { data: fr } = await admin
        .from("friendships")
        .select("user_a, user_b")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .eq("status", "accepted");
      const friendIds = new Set<string>();
      for (const f of fr ?? []) { friendIds.add(f.user_a === userId ? f.user_b : f.user_a); }
      friendHashes = userHashes.filter((h) => friendIds.has(hashToUser.get(h)!));
    }

    return json({ userHashes, friendHashes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
