# App Review resubmission playbook

Covers the three rejection items: **3.1.1** (IAP), **1.2** (UGC safety), **2.1** (face data).
Reply to each in App Store Connect (Resolution Center) and attach the screen recording for 1.2.

---

## Guideline 1.2 — User-Generated Content

### What we implemented this cycle
- **EULA / terms before auth:** an agreement line on the Welcome screen ("By continuing, you agree to our Terms of Use and Privacy Policy") covering the login path, **plus a required checkbox** at registration (CreateProfile) — the account can't be created until it's checked. Both link to the hosted Terms of Use and Privacy Policy.
- **Report (flag):** users can report reactions, comments, channel posts, channel clips, and profiles (`ContentActions` → `reportContent` → `content_reports`).
- **Block:** users can block from the same menus; blocked users' content is removed from the blocker's feeds **instantly**, and **every block now files a `content_reports` row so our moderation team is notified** (`blockUser` in `blocks.ts`).
- **Content filtering:** automated **video** moderation screens frames before upload (`moderateVideo.ts`); **text filtering** blocks objectionable handles, display names, and studio captions (`textFilter.ts`).
- **EULA content:** Terms of Use state **zero tolerance for objectionable content and abusive users**, with removal/ejection typically within 24 hours.

### ⚠️ Must be live before resubmitting
- Host **Terms of Use** at `https://www.vidrip.app/terms` and **Privacy Policy** at `https://www.vidrip.app/privacy` (drafts in `docs/legal/`). The in-app links point there; if they 404, this item fails.

### Screen recording to attach (record on a physical device)
1. **EULA before auth:** Launch app to the Welcome screen → show the "By continuing, you agree to our Terms of Use and Privacy Policy" text → tap **Terms of Use** and **Privacy Policy** to show they open. Then go through invite → CreateProfile and show the **required "I agree" checkbox** blocking account creation until checked.
2. **Flag/report:** Open a piece of content (reaction or channel post) → open the "…" menu → tap **Report** → pick a reason → show the "Report received" confirmation.
3. **Block:** From the same menu (or a profile) → tap **Block** → confirm → show that the blocked user's content is **immediately gone** from the feed.

---

## Guideline 2.1 — Face data

Paste the answers from **`docs/FACE_DATA_COLLECTION_PLAN.md` §6** (verbatim, below in short form):
- **Collected:** only when an optional AR lens is used while recording — sparse facial-landmark coordinates (eye/nose/mouth anchors + head roll, optional sparse face-outline mesh). No face images, no biometric template, no blendshapes, no gaze/iris.
- **Uses:** solely to position/render the cosmetic AR effect and re-render it on playback. Not for identification, authentication, ads, or analytics.
- **Shared / stored:** not shared with any third party; detection is on-device (MediaPipe, no cloud); landmark coordinates are stored with the user's own video (Supabase).
- **Retention:** kept as part of the video's render recipe; deleted when the user deletes the video or account.
- **Privacy policy:** "Camera & face effects" section at vidrip.app/privacy (quote it in the reply).

Supporting change this cycle: the camera usage string now discloses on-device AR face detection.

> Note: do **not** add new face-data collection in this submission — see the plan. Opt-in gesture analytics is a separate, later release.

---

## Guideline 3.1.1 — In-App Purchase  (RESOLVED via full removal — DONE)

**Decision (revised):** Do NOT add IAP. Instead, **remove every subscription/payment/price surface from the iOS app** so there is nothing to flag. Membership is handled entirely on the web; the app neither sells nor manages payment. The earlier IAP scaffold was reverted.

### ✅ What was removed/changed this cycle
- **IAP scaffold deleted** — `react-native-iap` uninstalled; `src/infrastructure/iap/*` and `IapPaywall.tsx` removed.
- **Neutral members lock** (`SubscriberPaywall.tsx` rewritten) — shows "Members only · handled on the web". **No price, no "subscribe", no payment language.** Ships as a **pure neutral lock with NO link** for this submission (`SHOW_WEB_JOIN_LINK = false` in `features/channels/config.ts`). The flag, when later enabled AND the user is on the US storefront (`utils/storefront.ts` device-region proxy), surfaces a plain "Join on the web" link — off now so the reviewer can't reach any external CTA. Wired in `ChannelScreen`.
- **ChannelScreen scrubbed** — removed the "You're subscribed! 🎉" alert, the "Unlocking your subscription…" state, the tier pill, and `justSubscribed` flow. Access re-checks on focus so a member who joined on web unlocks on return.
- **Account → read-only "Memberships"** — removed Unsubscribe/Resume + billing dates/prices; shows channel · tier, "Managed on the web". `cancelChannelSubscription`/`resumeChannelSubscription`/`billingPost`/web API removed from `channels.ts`.
- **Deep link** — dropped the `vidrip://channel/<id>?subscribed=1` semantics (+ dead `subscribedTabPending` store state); plain channel-open kept.
- **Onboarding/creator tooling price scrub** — removed `$3/$9/$25` tier prices from the creator-onboarding vignette and the `$X/mo` from the Studio collection→tier selector; softened "subscribe/recurring support" copy. No `$`-prices anywhere in-app.

### Compliance posture
The iOS app now contains **zero** consumer purchase/price/subscribe/manage surface AND **no external-purchase link** (the US web link is flag-gated off) — a reviewer can't reach a paywall, price, or steering CTA of any kind. Pure neutral lock. Creators still describe/drive web memberships through their own channels (outside the app). Nothing to articulate in review beyond "membership is managed on the web; the app sells nothing."

**Later (post-approval):** to enable the US "Join on the web" link, set `SHOW_WEB_JOIN_LINK = true` and ideally replace the device-region check with a real StoreKit `Storefront.current.countryCode` check (device region is only a proxy; the risky case is US device region + non-US App Store account). Consider gating the link to iOS only (Android's external-link rules differ from Apple's).

> Note: this trades in-app monetization for a clean review. If IAP is wanted later, the git history has the v12 scaffold.
