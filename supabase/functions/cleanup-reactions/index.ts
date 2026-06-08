import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLEANUP_SECRET = (Deno.env.get("CLEANUP_SECRET") ?? "").trim();
const TTL_DAYS = Number(Deno.env.get("REACTION_TTL_DAYS") ?? "14");

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

// Extract the storage path from a reactions public/signed URL.
function parsePath(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public\/|sign\/)?reactions\/(.+?)(?:\?|$)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Deletes the cloud relay copy of reactions once everyone involved has downloaded
// them (or after a TTL backstop). The recorder + downloaders keep local copies.
Deno.serve(async (req) => {
  if (!CLEANUP_SECRET || req.headers.get("x-cleanup-secret") !== CLEANUP_SECRET) {
    return json({ error: "forbidden" }, 403);
  }
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: rows, error } = await admin.rpc("reactions_to_expire", { ttl_days: TTL_DAYS });
    if (error) { return json({ error: error.message }, 500); }

    let expired = 0;
    for (const r of (rows ?? []) as Array<{ id: string; video_url: string }>) {
      const path = parsePath(r.video_url);
      if (path) {
        const { error: rmErr } = await admin.storage.from("reactions").remove([path]);
        if (rmErr) { console.error("[cleanup-reactions] remove failed", r.id, rmErr.message); continue; }
      }
      await admin.from("reactions").update({ video_url: null }).eq("id", r.id);
      expired++;
    }
    return json({ ok: true, expired });
  } catch (e: any) {
    console.error("[cleanup-reactions]", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
