import { defineConfig } from "hot-updater";
import { bare } from "@hot-updater/bare";
import { supabaseDatabase } from "@hot-updater/supabase";
import { tigrisStorage } from "./hot-updater-tigris";
import dotenv from "dotenv";

// hot-updater keeps its secrets in .env.hotupdater (gitignored), not .env.
dotenv.config({ path: ".env.hotupdater" });

export default defineConfig({
  build: bare({ enableHermes: true }),
  // Bundle FILES live on Tigris (S3-compatible, free egress), stored public-read with a plain https
  // storageUri so the update-server edge function resolves them via its remote-URL fast path — no Tigris
  // code in the edge function. See hot-updater-tigris.ts.
  storage: tigrisStorage({
    endpoint: process.env.HOT_UPDATER_S3_ENDPOINT!,
    region: process.env.HOT_UPDATER_S3_REGION ?? "auto",
    accessKeyId: process.env.HOT_UPDATER_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.HOT_UPDATER_S3_SECRET_ACCESS_KEY!,
    bucketName: process.env.HOT_UPDATER_S3_BUCKET_NAME!,
    publicUrl: process.env.HOT_UPDATER_S3_PUBLIC_URL!,
  }),
  // Bundle METADATA + the update-check server stay on Supabase (cheap; only file egress moves).
  database: supabaseDatabase({
    supabaseUrl: process.env.HOT_UPDATER_SUPABASE_URL!,
    supabaseServiceRoleKey: process.env.HOT_UPDATER_SUPABASE_SERVICE_ROLE_KEY!,
  }),
  // Cast: @hot-updater plugin generics skew across package versions; the runtime shape is correct.
} as any);
