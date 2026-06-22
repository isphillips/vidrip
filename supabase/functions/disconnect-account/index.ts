import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Disconnect a synced account AND remove the content it brought in. A plain delete of the
// synced_accounts row left the imported videos behind, so the channel's video count never
// dropped on disconnect and reconnecting re-imported on top (duplicate count). This removes
// the right data based on the connection's type:
//   creator → imported channel_posts + their re-hosted media in Storage
//   feed    → cached connected_feed_items
// ...but only when no OTHER connection of the same (provider, type) still needs it. The
// synced_accounts row is deleted last (cascades its tokens). Caller-authenticated (JWT).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
function res(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

type Admin = ReturnType<typeof createClient>;

// Delete the imported videos (channel_posts) + their re-hosted media for a provider.
async function removeImportedPosts(admin: Admin, userId: string, provider: string) {
  // Imported videos: channel_posts(poster_id = user, source_type = provider). Re-hosted
  // media lives at channel-clips/{provider}/{channelId}/<id>.{mp4,jpg}.
  const { data: posts } = await admin.from("channel_posts")
    .select("channel_id").eq("poster_id", userId).eq("source_type", provider);
  const channelIds = [...new Set((posts ?? []).map((p: { channel_id: string }) => p.channel_id).filter(Boolean))];
  for (const channelId of channelIds) {
    const prefix = `${provider}/${channelId}`;
    const { data: files } = await admin.storage.from("channel-clips").list(prefix, { limit: 1000 });
    if (files && files.length) {
      await admin.storage.from("channel-clips").remove(files.map((f: { name: string }) => `${prefix}/${f.name}`));
    }
  }
  await admin.from("channel_posts").delete().eq("poster_id", userId).eq("source_type", provider);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  try {
    // The platform (verify_jwt=true) validated the token; decode sub for the user id.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let userId = "";
    try {
      const payload = JSON.parse(atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.role === "authenticated" && typeof payload.sub === "string") { userId = payload.sub; }
    } catch { /* malformed token */ }
    if (!userId) { return res({ error: "unauthorized" }, 401); }

    const { accountId } = await req.json().catch(() => ({}));
    if (!accountId) { return res({ error: "accountId required" }, 400); }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify the account belongs to the caller; get its provider + connection type.
    const { data: acct } = await admin.from("synced_accounts")
      .select("id, provider, connection_type")
      .eq("id", accountId).eq("user_id", userId).maybeSingle();
    if (!acct) { return res({ error: "not found" }, 404); }
    const { provider, connection_type: connType } = acct as { provider: string; connection_type: string };

    // Only purge the imported data if this is the last connection of its (provider, type) —
    // e.g. don't wipe the creator import if another creator connection for the provider stays.
    const { count: sameTypeRemaining } = await admin.from("synced_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("provider", provider).eq("connection_type", connType).neq("id", accountId);

    if ((sameTypeRemaining ?? 0) === 0) {
      if (connType === "feed") {
        await admin.from("connected_feed_items").delete().eq("user_id", userId).eq("provider", provider);
      } else {
        await removeImportedPosts(admin, userId, provider);
      }
    }

    // Delete the account row last (cascades synced_account_tokens). A DB trigger hides the
    // creator channel once no connections remain.
    await admin.from("synced_accounts").delete().eq("id", accountId);

    return res({ ok: true });
  } catch (e) {
    console.error("[disconnect-account]", e);
    return res({ error: (e as Error)?.message ?? String(e) }, 500);
  }
});
