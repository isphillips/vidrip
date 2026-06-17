import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Canonical award path for exclusive collections. Two callers, one place for insert + idempotency +
// push + inbox:
//   • Individual (creator JWT):  body { collectionIds: string[], userIds: string[] }
//   • Tier (service-to-service): header x-grant-secret + body { tierId, userId }  (from the Stripe
//     webhook's applyFanSub when a subscription activates)
// Awards are immutable (unique collection_id+user_id, no revoke). The inserted row IS the inbox
// gift message (seen_at null); a push is sent only for newly-created awards.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRANT_SECRET = (Deno.env.get("COLLECTION_GRANT_SECRET") ?? "").trim();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-grant-secret",
};

type Admin = ReturnType<typeof createClient>;

async function sendAwardPush(awardId: string, collectionId: string, userId: string, admin: Admin) {
  const { data: col } = await admin.from("exclusive_collections")
    .select("name, channel_id, creator_id").eq("id", collectionId).maybeSingle();
  if (!col) { return; }
  const [{ data: grp }, { data: creator }] = await Promise.all([
    admin.from("groups").select("name").eq("id", col.channel_id).maybeSingle(),
    admin.from("users").select("display_name, handle").eq("id", col.creator_id).maybeSingle(),
  ]);
  const who = creator?.display_name || (creator?.handle ? `@${creator.handle}` : "A creator");
  const channelName = grp?.name ?? "a channel";
  await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      title: "🎁 Exclusive content unlocked",
      body: `${who} sent you "${col.name}" in ${channelName}`,
      type: "award",
      award_id: awardId,
      collection_id: collectionId,
      channel_id: col.channel_id,
      channel_name: channelName,
    }),
  }).catch(() => {});
}

// Insert awards idempotently; push only for rows that were newly created this call.
async function awardMany(admin: Admin, collectionIds: string[], userIds: string[], source: string, awardedBy: string | null) {
  const rows: { collection_id: string; user_id: string; source: string; awarded_by: string | null }[] = [];
  for (const c of collectionIds) { for (const u of userIds) { rows.push({ collection_id: c, user_id: u, source, awarded_by: awardedBy }); } }
  if (rows.length === 0) { return 0; }
  // ignoreDuplicates → only brand-new awards come back; existing ones are left untouched (immutable).
  const { data: inserted } = await admin.from("collection_awards")
    .upsert(rows, { onConflict: "collection_id,user_id", ignoreDuplicates: true })
    .select("id, collection_id, user_id");
  await Promise.all((inserted ?? []).map((r: any) => sendAwardPush(r.id, r.collection_id, r.user_id, admin)));
  return (inserted ?? []).length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));

    // Mode A — tier grant from the Stripe webhook (service-to-service).
    const secret = req.headers.get("x-grant-secret");
    if (secret && GRANT_SECRET && secret === GRANT_SECRET) {
      const { tierId, userId } = body;
      if (!tierId || !userId) { return json({ error: "tierId and userId required" }, 400); }
      const { data: grants } = await admin.from("collection_tier_grants").select("collection_id").eq("tier_id", tierId);
      const collectionIds = (grants ?? []).map((g: any) => g.collection_id);
      const awarded = await awardMany(admin, collectionIds, [userId], "tier", null);
      return json({ ok: true, awarded });
    }

    // Mode B — individual grant by the creator (JWT). Only collections the caller owns are honored.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let creatorId = "";
    try {
      const p = JSON.parse(atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
      if (p.role === "authenticated" && typeof p.sub === "string") { creatorId = p.sub; }
    } catch { /* malformed */ }
    if (!creatorId) { return json({ error: "unauthorized" }, 401); }

    const { collectionIds, userIds } = body as { collectionIds?: string[]; userIds?: string[] };
    if (!Array.isArray(collectionIds) || !Array.isArray(userIds) || !collectionIds.length || !userIds.length) {
      return json({ error: "collectionIds and userIds required" }, 400);
    }
    const { data: cols } = await admin.from("exclusive_collections")
      .select("id, creator_id").in("id", collectionIds);
    const owned = (cols ?? []).filter((c: any) => c.creator_id === creatorId).map((c: any) => c.id);
    if (!owned.length) { return json({ error: "no owned collections in request" }, 403); }

    const awarded = await awardMany(admin, owned, userIds, "individual", creatorId);
    return json({ ok: true, awarded });
  } catch (e: any) {
    console.error("[award-collection]", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
