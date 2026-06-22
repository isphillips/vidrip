# External Dependencies & Service Providers

Every third-party service Vidrip depends on, what it's used for, where it's wired, and where its
credentials live. Covers both repos: the React Native app (`vidrip/`) and the web app
(`vidrip-web/web/`, Cloudflare Pages).

> Scope: external **services/vendors** (things that process our data or that we pay/integrate with).
> On-device libraries (VisionCamera, Skia, MediaPipe face mesh, Reanimated, etc.) are not listed —
> they run locally and send no data out.

Credential locations referenced below:
- **Supabase function secrets** — `supabase secrets set …` (read via `Deno.env.get` in `supabase/functions/*`).
- **Cloudflare Pages env** — Pages project → Settings → Environment variables (read via `env.*` in `vidrip-web/web/functions/*`).
- **App public config** — `vidrip/src/infrastructure/oauth/config.ts` (public client IDs only; safe to ship).
- **Hot Updater** — `vidrip/.env.hotupdater` (gitignored).

---

## Core infrastructure

### Supabase
- **Use:** Primary backend — Postgres database, Auth (email magic-link + OTP + password + TOTP),
  Edge Functions (Deno), Storage (`channel-clips` bucket for re-hosted external media + reaction
  clips), Realtime. Also the storage/DB backend for Hot Updater OTA and the SMTP host for Resend.
- **Where:** Everywhere. App via `@supabase/supabase-js`; web via `@supabase/supabase-js` in Pages
  Functions; 20+ edge functions in `supabase/functions/`.
- **Config:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected into
  edge functions; set explicitly on the Pages project). Project ref: `ltpscwticavqutbzrrjb`.

### Cloudflare
- **Use:** Hosts `vidrip.app` (Cloudflare **Pages** — marketing site, `/dashboard`, `/account`,
  subscribe pages, legal, the OAuth callback, the data-deletion status page). **Pages Functions**
  under `/api/*` (Stripe, account, Stripe Connect, moderation, contact, OAuth callback). DNS + CDN.
  A **Worker proxy** for `/functions/v1/*` and `/auth/v1/*` exists but is largely deprecated
  (Cloudflare→Supabase loops are blocked — OAuth callback was moved to a native Pages Function).
- **Where:** `vidrip-web/web/` (`wrangler.toml`, `functions/`).
- **Config:** Cloudflare account/Pages project `vidrip-web`.

### Hot Updater (OTA updates)
- **Use:** CodePush-style over-the-air JS bundle updates so we ship fixes without an app-store
  release. **Backed by Supabase** (storage + database), so it's not a separate vendor.
- **Where:** `@hot-updater/react-native` in the app; `hot-updater.config.ts`; `HotUpdater.bundleURL()`
  in `ios/Vidrip/AppDelegate.mm`.
- **Config:** `vidrip/.env.hotupdater` → `HOT_UPDATER_SUPABASE_URL`, `HOT_UPDATER_SUPABASE_ANON_KEY`,
  `HOT_UPDATER_SUPABASE_SERVICE_ROLE_KEY`, `HOT_UPDATER_SUPABASE_BUCKET_NAME`.

---

## Payments

### Stripe
- **Use:** Two things —
  1. **Subscriptions / billing:** creator "Pro" plans and channel "Pass" purchases (Checkout,
     customer portal, webhooks).
  2. **Stripe Connect (Express):** creator **payouts** — onboarding, dashboard login links, payout
     readiness status (`stripe_connect_account_id` per user).
- **Where:** `vidrip-web/web/functions/api/subscribe/*`, `api/billing/*`, `api/billing/pass/*`,
  `api/connect/*`, shared `functions/_stripe.ts`. (No Stripe code in the RN app — all server-side.)
- **Config (Cloudflare Pages env):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PASS`, `APP_URL`.

---

## Email

### Resend
- **Use:** Transactional **email delivery**, configured as the **SMTP provider inside Supabase Auth**
  — magic links, OTP confirmation codes, password reset. **Not called directly in our code** (Supabase
  Auth sends through it), which is why there's no `RESEND_*` env var in the repo.
- **Where:** Supabase Dashboard → Authentication → SMTP settings.
- **Config:** Resend SMTP host/credentials entered in Supabase Auth (not in this repo).

---

## AI / Moderation

### OpenAI
- **Use:** **Content moderation.** Extracted video frames are checked before a clip is published, to
  block disallowed content (`moderate-frames` edge function; `assertVideoAllowed` /
  `moderateVideo` on the client side gate uploads).
- **Where:** `supabase/functions/moderate-frames/` → `https://api.openai.com`.
- **Config (Supabase secret):** `OPENAI_API_KEY`.

---

## Media (creator video hosting)

### Bunny.net (Bunny Stream + CDN)
- **Use:** Hosting, transcoding, and streaming for **creator-studio videos** (the Bunny `bunny`
  `source_type`). Resumable uploads via TUS, token-authenticated signed embeds, and a webhook fired
  when encoding completes. (Note: imported IG/FB **reels** are re-hosted to **Supabase Storage**, not
  Bunny — Bunny is only the creator-studio pipeline.)
- **Where:** App `tus-js-client` + `BunnyEmbedPlayer`/`BunnyVideoLayer` (embed `iframe.mediadelivery.net`);
  edge functions `creator-video-create`, `creator-video-sign`, `creator-video-status`, `bunny-webhook`
  → `https://video.bunnycdn.com`.
- **Config (Supabase secrets):** `BUNNY_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `BUNNY_CDN_HOSTNAME`,
  `BUNNY_TOKEN_AUTH_KEY`, `BUNNY_WEBHOOK_SECRET`.

---

## Push notifications

### Firebase Cloud Messaging (FCM)
- **Use:** Push notification delivery (reaction received, gift/award, channel activity, etc.).
- **Where:** App `@react-native-firebase/app` + `@react-native-firebase/messaging` (token registration);
  edge function `send-push` → `https://fcm.googleapis.com`.
- **Config (Supabase secret):** FCM/Google service-account credentials used by `send-push`.
  Firebase is used **only for messaging** here — not analytics.

### Apple Push Notification service (APNs)
- **Use:** iOS push delivery (FCM routes to APNs for iOS devices). Foreground display + tap handling.
- **Where:** App `@react-native-community/push-notification-ios`; `ios/Vidrip/AppDelegate.mm`.
- **Config:** APNs key/cert uploaded to the Firebase project.

---

## Social integrations (creator account sync & import)

Creators connect an external account to import their content (Members Only channel / browse feed) or
pull a personal feed. OAuth runs in the system browser → redirects to
`https://vidrip.app/api/oauth-callback` → `reaxn://` deep link; token exchange + Graph calls are
server-side in `supabase/functions/sync-oauth`. See also `src/infrastructure/oauth/config.ts`.

### Google / YouTube
- **Use:** (1) OAuth (`youtube.readonly`) to connect a channel and import uploads / pull Liked Videos
  into "For You". (2) **YouTube Data API v3** (separate API key) to ingest Shorts that populate the
  Browse/Search feed and resolve creator video metadata.
- **Where:** `sync-oauth`, `refresh-feed`, `fetch-recommended`, `fetch-shorts`,
  `fetch-channel-shorts`, `fetch-latest-shorts`, `cleanup-shorts` → `googleapis.com` /
  `oauth2.googleapis.com` / `youtube.com`.
- **Config:** App public `GOOGLE_CLIENT_ID`; Supabase secrets `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `YOUTUBE_API_KEY_MP`.

### TikTok
- **Use:** Login Kit OAuth (`user.info.basic`, `video.list`) + Display API to connect and import the
  creator's own videos.
- **Where:** `sync-oauth` → `open.tiktokapis.com` / `tiktok.com`.
- **Config:** App public `TIKTOK_CLIENT_KEY`; Supabase secrets `TIKTOK_CLIENT_KEY`,
  `TIKTOK_CLIENT_SECRET`.

### Instagram
- **Use:** Instagram Login (`instagram_business_basic`) + Graph API for the creator's own profile +
  Reels import. (The `instagram-oembed` edge fn resolves a *pasted* Reel link's title/thumbnail via a
  **tokenless Open Graph scrape** — NOT the Instagram oEmbed / "oEmbed Read" Meta feature, which we do
  **not** use and have not submitted for review.)
- **Where:** `sync-oauth` (`graph.instagram.com`, `api.instagram.com`); `instagram-oembed` (OG scrape, no Meta API).
- **Config:** App public `INSTAGRAM_APP_ID`; Supabase secrets `INSTAGRAM_APP_ID`,
  `INSTAGRAM_APP_SECRET`. Data-deletion callback: `meta-data-deletion` edge fn.

### Facebook / Meta
- **Use:** Facebook Login (`pages_show_list`, `pages_read_engagement`) + Graph API to list the
  creator's Pages and import the chosen Page's Reels.
- **Where:** `sync-oauth` → `graph.facebook.com`.
- **Config:** App public `FACEBOOK_APP_ID`; Supabase secrets `FACEBOOK_APP_ID`,
  `FACEBOOK_APP_SECRET`. (Often the **same Meta app** as Instagram.) Data-deletion callback:
  `meta-data-deletion` edge fn.

---

## Not currently integrated (noted for completeness)

- **Analytics / product metrics:** none. (Firebase is push-only.)
- **Error/crash reporting:** none yet — a custom logger (`src/infrastructure/logging/logger.ts`)
  is the seam; comment notes Sentry/Crashlytics as a future add.

---

## Internal shared secrets (not vendors)

These authenticate our own services to each other — listed so they're not mistaken for third parties:
`INTERNAL_SECRET`, `CLEANUP_SECRET`, `COLLECTION_GRANT_SECRET` (shared app↔web↔edge),
`REACTION_TTL_DAYS` (config), plus per-function HMAC secrets (`BUNNY_WEBHOOK_SECRET`, etc.).
