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
// send-push rejects any caller without this shared secret (x-internal-secret), so award pushes must
// carry it — same value the DB trigger uses. Project-wide secret, already set for send-push itself.
const INTERNAL_SECRET = (Deno.env.get("INTERNAL_SECRET") ?? "").trim();

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
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "x-internal-secret": INTERNAL_SECRET,
      "Content-Type": "application/json",
    },
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
  }).catch((e) => { console.error("[award-collection] send-push fetch failed", e); return null; });
  // Don't swallow a non-2xx silently — a 401 here means the internal secret is missing/mismatched.
  if (res && !res.ok) { console.error("[award-collection] send-push", res.status, await res.text().catch(() => "")); }
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

// Current active subscribers of any of these tiers (deduped). Mirrors who the Stripe webhook grants to on
// a single activation, but for the whole tier at once — this is the back-fill that was missing.
async function subscribersForTiers(admin: Admin, tierIds: string[]): Promise<string[]> {
  if (!tierIds.length) { return []; }
  const nowIso = new Date().toISOString();
  const { data } = await admin.from("channel_subscriptions")
    .select("user_id")
    .in("tier_id", tierIds)
    .in("status", ["active", "trialing"])
    .or(`current_period_end.is.null,current_period_end.gt.${nowIso}`);
  return [...new Set((data ?? []).map((r: any) => r.user_id))];
}

// Publish a collection: award every current subscriber of its mapped tiers (fires each new award's push),
// then mark it published. Shared by the creator's "Publish now" (JWT) and the pg_cron deliver-due sweep.
async function publishCollection(admin: Admin, collectionId: string): Promise<number> {
  const { data: grants } = await admin.from("collection_tier_grants").select("tier_id").eq("collection_id", collectionId);
  const tierIds = (grants ?? []).map((g: any) => g.tier_id);
  const recipients = await subscribersForTiers(admin, tierIds);
  const awarded = await awardMany(admin, [collectionId], recipients, "tier", null);
  await admin.from("exclusive_collections")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", collectionId);
  return awarded;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: cors }); }
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));

    // Mode A — service-to-service (x-grant-secret). Two sub-modes:
    const secret = req.headers.get("x-grant-secret");
    if (secret && GRANT_SECRET && secret === GRANT_SECRET) {
      // A1 — pg_cron sweep: publish every scheduled collection whose time has come.
      if (body?.mode === "deliver-due") {
        const nowIso = new Date().toISOString();
        const { data: due } = await admin.from("exclusive_collections")
          .select("id").eq("status", "scheduled").lte("publish_at", nowIso);
        let delivered = 0;
        for (const c of (due ?? []) as any[]) { delivered += await publishCollection(admin, c.id); }
        return json({ ok: true, collections: (due ?? []).length, delivered });
      }

      // A2 — Stripe webhook activation: grant this tier's PUBLISHED collections to the new subscriber
      // (draft/scheduled collections are withheld until they're explicitly published).
      const { tierId, userId } = body;
      if (!tierId || !userId) { return json({ error: "tierId and userId required" }, 400); }
      const { data: grants } = await admin.from("collection_tier_grants").select("collection_id").eq("tier_id", tierId);
      const grantedIds = (grants ?? []).map((g: any) => g.collection_id);
      let collectionIds: string[] = [];
      if (grantedIds.length) {
        const { data: pub } = await admin.from("exclusive_collections")
          .select("id").in("id", grantedIds).eq("status", "published");
        collectionIds = (pub ?? []).map((r: any) => r.id);
      }
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

    // Mode B1 — creator publishes a collection: back-fill all current subscribers of its mapped tiers.
    const { publishCollectionId } = body as { publishCollectionId?: string };
    if (publishCollectionId) {
      const { data: col, error: colErr } = await admin.from("exclusive_collections")
        .select("creator_id").eq("id", publishCollectionId).maybeSingle();
      if (colErr) { console.error("[award-collection] publish read failed", colErr.message); }
      if (!col || col.creator_id !== creatorId) { return json({ error: "not your collection" }, 403); }
      const awarded = await publishCollection(admin, publishCollectionId);
      return json({ ok: true, awarded });
    }

    // Mode B2 — individual grant by the creator. Only collections the caller owns are honored.
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
