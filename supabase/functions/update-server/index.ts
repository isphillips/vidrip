import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createHotUpdater } from "@hot-updater/server/runtime";
import {
  supabaseEdgeFunctionDatabase,
  supabaseEdgeFunctionStorage,
} from "@hot-updater/supabase/edge";
import { Hono } from "npm:hono";

// Function slug as deployed (hot-updater's deployer injects this global; hard-coded
// here since we deploy manually via `supabase functions deploy`).
const functionName = "update-server";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const functionBasePath = `/${functionName}`;
const hotUpdaterBasePath = "/";

const hotUpdater = createHotUpdater({
  database: supabaseEdgeFunctionDatabase({
    supabaseUrl,
    supabaseServiceRoleKey,
  }),
  // Bundle files now live on Tigris and are stored with a public https:// storage_uri, which the
  // hot-updater server runtime returns verbatim + reads via fetch() — so NO Tigris adapter is needed
  // here. The supabase storage adapter below is kept ONLY to resolve LEGACY supabase-storage:// bundles
  // until they age out (see scripts/hot-updater/drain-supabase-bundles.mjs); remove it once every
  // bundle's storage_uri is https.
  storages: [
    supabaseEdgeFunctionStorage({
      supabaseUrl,
      supabaseServiceRoleKey,
    }),
  ],
  basePath: hotUpdaterBasePath,
  routes: {
    updateCheck: true,
    bundles: false,
  },
});

const app = new Hono().basePath(functionBasePath);

app.get("/ping", (c) => c.text("pong"));
app.mount(hotUpdaterBasePath, hotUpdater.handler);

Deno.serve(app.fetch);
