# Channel Subscription Model — Plan (DRAFT, not started)

Status: **planning only — no code/migrations written yet.** Awaiting go-ahead.

## Goal
Channel owners can gate **reacting** and **posting reviews** on their channel to paying
subscribers. Viewing stays governed by existing members-only / invite-only logic.

## The dominating constraint: Apple/Google IAP (not Stripe)
Gating digital in-app content behind a paid sub MUST use **StoreKit In-App Purchase** on
iOS (guideline 3.1.1) and **Google Play Billing** on Android. Stripe/card checkout is not
allowed for this inside the app.
- Apple takes **15–30%** (15% via Small Business Program / after a sub's first year; else 30%).
- Products are **pre-defined in App Store Connect** — fixed price points, not arbitrary
  per-creator amounts (per-creator custom pricing needs Apple's approval-gated Advanced
  Commerce API → out of scope).
- Requires **server-side receipt validation** (App Store Server API) + **App Store Server
  Notifications v2** webhook to track renew/cancel/refund.

## Decisions (defaults — confirm or change)
1. **Pricing:** three fixed tiers **$2.99 / $4.99 / $9.99/mo**, creator picks one. Default $4.99.
2. **Payouts:** **platform-only revenue in v1** — creators are NOT paid out yet. (Payouts are a
   separate system: Apple pays the developer, then you pay creators via Stripe Connect/PayPal,
   reconciling against Apple reports. Roughly doubles scope.) ⚠️ This affects whether creators
   will actually enable it.
3. **Platform:** **iOS first**; Android later via Play Billing (mirror the structure).
4. **The gate:** only active subscribers can **react** + **post reviews** on the channel.

## Fits existing code
Reuses gating primitives already present: `is_members_only`, `invite_only`, and the
`locked`/`obscured` thumbnail states (lock.png). A paid sub is a new gate dimension on top.

## Phase 0 — Prerequisites (owner, in App Store Connect) — BLOCKS everything
1. Auto-renewable subscription group "Channel Subscription" with products
   `channel_sub_299`, `channel_sub_499`, `channel_sub_999`.
2. App Store Server API key (.p8) + issuer/key IDs → Supabase secrets.
3. Point App Store Server Notifications v2 URL at the `appstore-notifications` edge function.
4. Enroll in Small Business Program if eligible (15% vs 30%).

## Phase 1 — Data model (migrations) — testable without a rebuild
- `channels`: add `subscription_required boolean default false`,
  `subscription_price_cents int null` (299/499/999), `subscription_product_id text null`.
- New `channel_subscriptions`: `id, user_id, channel_id, status (active|expired|grace|refunded),
  platform (ios|android), original_transaction_id, product_id, current_period_end,
  created_at, updated_at`. RLS: user reads own; service role writes.
- SQL helper `has_active_channel_sub(uid, channel_id) returns boolean` (SECURITY DEFINER).

## Phase 2 — Server (edge functions)
- `validate-purchase`: client posts StoreKit transaction → validate via App Store Server API →
  upsert `channel_subscriptions` → return entitlement (mirrors `sync-oauth` JWT pattern).
- `appstore-notifications`: receives ASSN v2 webhooks (RENEW/EXPIRED/REFUND/GRACE_PERIOD) →
  updates subscription rows. Keeps state correct without the client.
- Enforce `has_active_channel_sub` server-side inside `commitChannelClip` and `postReview`
  paths (and the RLS/RPCs behind them) — not just hidden in the UI.

## Phase 3 — Client
- Add `react-native-iap` (StoreKit 2) — native module → pod install + **rebuild**, via yarn.
- `useChannelSubscription(channelId)` hook + `SubscribePaywall` sheet → `requestSubscription`
  → `validate-purchase` → unlock. Reuse lock.png / locked-tile treatment for gated channels.
- Creator side: "Require subscription" toggle + tier picker in `ChannelSettingsSheet`.
- "Restore Purchases" button (Apple requirement).

## Phase 4 — Compliance / polish
- Paywall must show price, billing period, auto-renew terms, Terms/Privacy links, and Restore
  Purchases — common rejection reasons.

## Suggested build order
Phase 1 + 2 first (data model + server, independently testable, no rebuild), then the IAP
client once the App Store Connect products are live.

## Open confirmations before starting
- OK with Apple's 15–30% cut?
- OK that v1 is platform-only revenue (no creator payouts yet)?
- Pricing tiers as above, or different points?
