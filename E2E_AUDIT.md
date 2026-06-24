# Vidrip E2E — Static Audit & Defect Catalog

Generated against the **Pre-Launch E2E Test Plan (2026-06-21)**. This is a *catalog-first*
pass: every case in the plan was checked against the source under `src/`, with the
implementing file:line, a status, and whether a Maestro flow can exercise it. **No
application defects were fixed in this pass** — fixes are triaged separately (see
[§ Defects to fix](#defects-to-fix-front-end-code-level)).

How to read **Status**:

| Status | Meaning |
|---|---|
| `PASS-LIKELY` | Code implements the expected behavior; verify on device/with data. |
| `GAP` | Code is missing or contradicts the expected behavior (a defect — see catalog). |
| `BLOCKED:Pn` | Gated on a pre-launch blocker (can't be tested until done). |
| `NEEDS-DEVICE` | Only verifiable on a physical device (camera/recording/notifications). |

Pre-launch blockers referenced: **P1** OAuth client secrets · **P2** Supabase prod
migrations / RLS / edge fns · **P4** push (APNs/FCM) creds · **P5** universal links ·
**P7** seeded test accounts & content.

**Automatable?** = can a Maestro flow on a real device drive it: `YES` / `PARTIAL`
(UI reachable but a camera/browser/server step isn't) / `NO`.

---

## Smoke (§3) — run first, all must pass

| Case | Expected | File(s):line | Status | Automatable? | Notes |
|---|---|---|---|---|---|
| SM1 | Cold launch → onboarding → sign in → Feed | `RootNavigator.tsx:84-106,249-305`; `SignInScreen.tsx:37-50` | BLOCKED:P1 | PARTIAL | Magic link can't be intercepted headlessly — E2E uses **password** sign-in (account A). First run shows Onboarding before Feed. |
| SM2 | Bottom nav each tab loads, no crash | `MainTabBar.tsx:443-505`; `MainTabs.tsx:167-238` | PASS-LIKELY | YES | All 5 visible tabs wired (Feed/Channels/Studio FAB/Messages/Browse). |
| SM3 | Account from top-nav blob (every tab) | blobs on Feed/Channels/Browse/Messages; **Studio header has none** `StudioHomeScreen.tsx:222-232` | **GAP** | PARTIAL | **Studio home lacks the Account blob** → "every tab" fails on Studio. |
| SM4 | Friend share → Feed → doom-react saves; entry clears | `FeedHomeScreen.tsx:65-100,238-240`; `reactQueueStore.ts`; `reactionStorage.ts:140-201` | NEEDS-DEVICE | PARTIAL | Full path present; camera is device-only; row clears on next focus (not optimistic). |
| SM5 | Studio clip trim→filter→overlay→details→post → "Live" | `StudioStack.tsx:23-32`; `StudioDetailsScreen.tsx:136-176` | NEEDS-DEVICE | PARTIAL | Real chain has an **Audio** step (Capture→Trim→Filter→**Audio**→Overlay→Details). "Live" is a **server webhook** — not observable in-app. |
| SM6 | Browse shorts → send to friend → received | `ShareHomeScreen.tsx:801-847`; `threads.ts:279-347` | BLOCKED:P7 | YES | `sendThread` creates pending member row; "received" = SM4 feed query. Needs seeded friend. |
| SM7 | Channel intro → react to video → recorded | `ChannelScreen.tsx:555-562`; `channels.ts:1122-1158` | NEEDS-DEVICE | PARTIAL | Intro + react + commit/relay wired; recording device-only. |
| SM8 | Group chat w/ 2 friends; no dup on retry | `CreateGroupChatScreen.tsx:45-78`; `channels.ts:479-484` rpc | BLOCKED:P2 | PARTIAL | Double-tap guarded, but **retry-after-error not deduped client-side**; idempotency depends on server RPC `create_group_chat` (not in repo). |
| SM9 | Connect Instagram → spinner on correct row | `AccountScreen.tsx:156-159,459-463` | BLOCKED:P1 | PARTIAL | Spinner correctly scoped to IG row; connect needs OAuth secrets. |
| SM10 | Force-quit mid-upload → resumes/queues; no data loss | `uploadStore.ts`; `bakeQueueStore.ts`; `pendingReactionsStore.ts` | **GAP** | NO | **No queue persists to disk** — all in-memory zustand. Upload does NOT auto-resume after kill; recovery is lazy on revisit. Recording file+DB row survive. |

---

## A. Auth & Onboarding (§5)

| Case | Status | File(s):line | Automatable? | Notes |
|---|---|---|---|---|
| A1 First-run onboarding, replays only when triggered | PASS-LIKELY | `OnboardingScreen.tsx:29-225`; `onboarding.ts:5-27`; `AccountScreen.tsx:561` | YES | `vidrip_onboarded_v1` persisted; replay from Account "How it works". |
| A2 Magic-link "sent" confirmation, input preserved | BLOCKED:P1 | `SignInScreen.tsx:37-50,67-84` | PARTIAL | Swaps to "Check your email" preserving email; needs Supabase email. |
| A3 Invite code gate, clear error | BLOCKED:P2 | `EnterInviteCodeScreen.tsx:37-57`; `CreateProfileScreen.tsx:27-52` | YES | Valid→CreateProfile w/ code hero; invalid/used→alert. Needs seeded codes. |
| A4 Create profile fits, dup handle → error | **GAP** | `CreateProfileScreen.tsx:54-196` | PARTIAL | **No avatar field at creation**; **no client-side dup-handle error** (server-enforced); form in ScrollView (may scroll on small devices). |
| A5 OAuth connect all 4 providers | BLOCKED:P1 | `AccountScreen.tsx:156-234`; `oauth/config.ts:50-107,115-147` | PARTIAL | Build URL→browser→deep-link back→row repaints. Needs secrets. |
| A6 OAuth cancel/deny graceful | BLOCKED:P1 | `AccountScreen.tsx:162-174` | PARTIAL | "Couldn't connect" alert; `.finally` clears spinner; row stays Connect. |
| A7 Facebook two-phase | BLOCKED:P1 | `AccountScreen.tsx:180-234,595-651`; `config.ts:79-96` | PARTIAL | Pages picker; dismiss→"Connected, choose a Page"+resume. Needs Meta review. |
| A8 Sign out / back in | BLOCKED:P1 | `authStore.ts:26`; `RootNavigator.tsx:84-106` | PARTIAL | signOut clears store + unregisters push; re-auth re-fetches profile. |

---

## B. Feed & Doom-React (§5)

| Case | Status | File(s):line | Automatable? | Notes |
|---|---|---|---|---|
| B1 Actionable-only Feed; caught-up in Messages | PASS-LIKELY | `FeedHomeScreen.tsx:65-77`; `MessagesHomeScreen.tsx:82-99` | YES | Feed filters `unreadCount>0` / `unseen_count>0`; Messages unfiltered. |
| B2 Friend doom-react chain | PASS-LIKELY | `FeedHomeScreen.tsx:86-100`; `reactQueueStore.ts:30-36` | NEEDS-DEVICE | `[...mine, ...rest]`; back clears queue. Covered by `reactQueueStore.test.ts`. |
| B3 Channel doom-react oldest-first then feed | PASS-LIKELY | `FeedHomeScreen.tsx:104-133` | NEEDS-DEVICE | Posts sorted oldest-first, then thread targets appended. |
| B4 Channel rows interleaved by last unseen | BLOCKED:P2 | `FeedHomeScreen.tsx:69-77`; `channels.ts:462-475` rpc | PARTIAL | Needs `get_channel_updates_summary` (not in local migrations). |
| B5 Feed badge = total actionable, updates | PASS-LIKELY | `FeedHomeScreen.tsx:147-150`; `feedStore.ts:9-12`; `MainTabs.tsx:179` | YES | Sum of friend+group unread + channel unseen. |
| B6 Sort recent-first; pull-to-refresh | PASS-LIKELY | `FeedHomeScreen.tsx:59,76`; `friendConversation.ts:116-119` | YES | Verified by `friendConversation.test.ts`. |
| B7 DrippyEyes on unreplied + timestamps | PASS-LIKELY | `FeedHomeScreen.tsx:235-236`; `ConversationRow.tsx:81-87` | YES | Eyes only on unreplied friend rows (by design). |
| B8 Empty state "You're all caught up" | PASS-LIKELY | `FeedHomeScreen.tsx:221-225` | YES | Copy: **"You're all caught up!"** (exclamation). |
| B9 Long-press group → branded rename sheet | PASS-LIKELY | `FeedHomeScreen.tsx:271,290-313` | NEEDS-DEVICE | **Minor:** Feed uses a plain centered fade modal; the *branded slide-up sheet* is in **Messages** (`MessagesHomeScreen.tsx:191-213`). |

---

## C. Channels (§5)

| Case | Status | File(s):line | Automatable? | Notes |
|---|---|---|---|---|
| C1 Public + members-only listed; DM channels excluded | PASS-LIKELY | `ChannelsHomeScreen.tsx:45-63`; `channels.ts:129-283,341-404` | PARTIAL | `fetchPrivateChannels` never called by Home. Needs P7 seed to distinguish. |
| C2 Card: last-updated stamp, video count, Intro tile | **GAP** | `ChannelCard.tsx:68-71,102-114` | PARTIAL | Video count ✓ (not member count ✓), Intro tile ✓, but **no last-updated stamp** (`last_message_at` hardcoded null `channels.ts:203,270`). |
| C3 Intro full-screen autoplay, auto/tap close | PASS-LIKELY | `ChannelsHomeScreen.tsx:200-213` | PARTIAL | `Modal` + `paused={false}` + `onEnd` close + tap close. Needs `ad_video_url`. |
| C4 Join / subscribe / invite / locked | PASS-LIKELY | `ChannelScreen.tsx:272-290,581-582`; `channels.ts:1044-1058` | PARTIAL | Gated subscribe = **web Stripe checkout** (external); entitlement BLOCKED:P2. |
| C5 React to channel post; count increments | PASS-LIKELY | `ChannelPostScreen.tsx:371-374`; `channels.ts:1122-1150` | NEEDS-DEVICE | Optimistic pending reaction; count refreshes on focus. |
| C6 Leave a review; count updates | PASS-LIKELY | `ChannelPostScreen.tsx:355-362`; `channels.ts:1263-1301` | NEEDS-DEVICE | Review gated on having reacted; count updates on next focus. |
| C7 Floating mic+video record buttons (Studio style) | **GAP** | `ChannelScreen.tsx:719-736` | PARTIAL | Floating buttons render **only in private-chat branch** (`!isPublic`). **Public/members-only channels have none** — they record via post tiles. Contradicts plan. |
| C8 Members-only playback gated for non-members | PASS-LIKELY | `ChannelScreen.tsx:386,429-443`; `channels.ts:296-339` | PARTIAL | Two layers (invite-only + subscriber paywall). Subscriber entitlement BLOCKED:P2. |

---

## D. Messages & Friends (§5)

| Case | Status | File(s):line | Automatable? | Notes |
|---|---|---|---|---|
| D1 Messages: all convs incl caught-up; no "to react" | PASS-LIKELY | `MessagesHomeScreen.tsx:82-99`; `useFriendConversations.ts:73-81` | YES | Uses DM-only unread for badges; reactions belong to Feed. |
| D2 Friends blob menu (Messages only), not clipped | PASS-LIKELY | `MessagesHomeScreen.tsx:156-188` | NEEDS-DEVICE | Spring popover in full-screen `Modal`; items: "Add a friend" / "Import from contacts" / "New group chat". |
| D3 Add a friend, back to Messages | PASS-LIKELY | `MessagesHomeScreen.tsx:170`; `AddFriendScreen.tsx:29-42` | YES | **Note:** AddFriend is **handle-only** — no code entry on this screen (codes redeemed elsewhere). |
| D4 Import contacts → invite codes, no phone stored | PASS-LIKELY | `InviteContactsScreen.tsx:183-199`; `contactMatch.ts:14-37` | NEEDS-DEVICE | `sms:` deep link w/ code; only `{code,name,sentAt}` stored; emails sha256-hashed on device. |
| D5 New group chat slides from right, nav preserved | PASS-LIKELY | `MainTabs.tsx:101`; `CreateGroupChatScreen.tsx:45-61` | NEEDS-DEVICE | Messages path = `slide_from_right` (Feed path is `modal`). "No purple gutter" not static-verifiable. |
| D6 Group dedupe (order-independent) | BLOCKED:P2 | `channels.ts:479-484` rpc | PARTIAL | Dedup must live in server `create_group_chat`; not in local migrations. |
| D7 Friend conversation merged timeline + floating buttons | PASS-LIKELY | `FriendConversationScreen.tsx:60-87,270-277` | NEEDS-DEVICE | Merges shares + DM clips/audio; floating right-side video+mic. |
| D8 Swipe to hide (for me only), persists | PASS-LIKELY | `MessagesHomeScreen.tsx:100-107`; `useFriendConversations.ts:64-71` | NEEDS-DEVICE | AsyncStorage `vidrip_hidden_convs`; no delete RPC; survives refresh. |
| D9 DM audio/video send | PASS-LIKELY | `FriendConversationScreen.tsx:132-171`; `ChannelVideoRecordScreen.tsx:19-30` | NEEDS-DEVICE | Hold mic <0.5s discarded else preview→Send; video compose→upload. |

---

## E. Studio (§5)

| Case | Status | File(s):line | Automatable? | Notes |
|---|---|---|---|---|
| E1 Studio as a tab, no top X, deeper hides nav | PASS-LIKELY | `MainTabBar.tsx:434-435,499`; `StudioHomeScreen.tsx:222-232` | PARTIAL | FAB→StudioHome; bar hides on every step != StudioHome. |
| E2 Capture→Trim; >3min clamped | PASS-LIKELY | `recipe.ts:8` (`MAX_STUDIO_MS=180_000`); `StudioCaptureScreen.tsx:32,195`; `StudioTrimScreen.tsx:60-112` | PARTIAL | 180s auto-stop + trim clamp + export assert backstop. Live record device-only. |
| E3 Filter/adjust 5 params + presets | PASS-LIKELY | `StudioFilterScreen.tsx:26-34,92-95,141` | PARTIAL | Presets are a horizontal strip (grid is E4). Pixel-match needs eyeball. |
| E4 Lens grid 4-col edge-to-edge | PASS-LIKELY | `LensPicker.tsx:65-140` | YES | Confirmed 4-col + trailing spacers eliminate right gutter; tabs switch. |
| E5 Overlay/stickers composite | PASS-LIKELY | `StudioOverlayScreen.tsx:53,255-272,363-391` | PARTIAL | Text/sticker/emoji/animated/overlays live over preview; baked on export. |
| E6 Publish fork friends vs channel | PASS-LIKELY / BLOCKED:P2 | `StudioDetailsScreen.tsx:136-212,290-312` | PARTIAL | Fork is `is_creator`-gated; delivery needs backend. |
| E7 Drafts: exit → resume raw or last-saved | PASS-LIKELY | `useStudioAutosave.ts:20-28`; `StudioHomeScreen.tsx:105-140` | PARTIAL | **Minor GAP:** `resumeLastSaved` has no `'audio'` branch — audio-stage draft resumes at Trim, not Music. |
| E8 Scheduled posts hidden until release | PASS-LIKELY / BLOCKED:P2 | `StudioDetailsScreen.tsx:117-143`; `api.ts:153,206` | PARTIAL | Schedule UI + Scheduled tab; viewer-side hiding is server `release_date` filter. |
| E9 Collections / exclusive gating | PASS-LIKELY / BLOCKED:P2 | `StudioCollectionEditScreen.tsx:105-291` | PARTIAL | Adding a video makes it exclusive (leaves regular feed); gating server-side. |
| E10 Processing status + manual refresh | PASS-LIKELY / BLOCKED:P2 | `StudioHomeScreen.tsx:20-25,71-82,173-179`; `api.ts:127-131` | PARTIAL | Status labels + re-check button; transitions driven by Bunny webhook. |

---

## F. Browse / Share & Reactions (§5)

| Case | Status | File(s):line | Automatable? | Notes |
|---|---|---|---|---|
| F1 Shorts feed plays YT/TikTok/IG/creator | PASS-LIKELY | `ShareHomeScreen.tsx:316-348,1233-1345` | PARTIAL | 3-slot WebView pool; creator (Bunny) plays in recorder, not grid. |
| F2 Share comment + send buttons (Studio-styled) | PASS-LIKELY / BLOCKED:P2 | `ShareHomeScreen.tsx:801-847,1368-1373` | PARTIAL | GradientIcon buttons; delivery via `sendThread` needs backend. |
| F3 Reaction recorder 180s cap + countdown | PASS-LIKELY | `ReactionRecorder.tsx:245-254,297-300,751-774`; `RecordReactionScreen.tsx:181,196` | NO | Both paths pass `maxDuration={180}`; receding cap bar + countdown. Camera device-only. |
| F4 Face lens 478-pt mesh live | PASS-LIKELY | `faceTracking.ts:82-102,284-313`; `faceLens.tsx:40-44` | NO | Live mesh is `faceTracking.ts` (MediaPipe). **Note:** `useFaceLandmarks.ts` is a null stub — not the impl. Native plugin device-only. |
| F5 Anonymous: silhouette + deep voice, obscured in saved file | PASS-LIKELY / BLOCKED:P2 | `useAnonymousMode.ts:6-19`; `ReactionRecorder.tsx:310-337`; `recipe.ts:56-68` | NO | Bakes silhouette+deep-voice **before** upload (raw never leaves device). Needs `users.react_anonymously`. |
| F6 Headphones prompt | PASS-LIKELY | `ReactionRecorder.tsx:271-278,744-749` | NO | Toast "🎧 Use headphones for cleaner audio" on record-start if none. Native check device-only. |
| F7 Afterthought (non-queued) records + attaches | PASS-LIKELY | `ReactionRecorder.tsx:90-94,430-447`; `RecordReactionScreen.tsx:196` | NO | Offered only when `!queued`; channel path disables it. |
| F8 Intro pre-roll once per session per thread | PASS-LIKELY | `IntroPreroll.tsx:16-69`; `introSeenStore.ts:17-22` | PARTIAL | Shared store survives `navigation.replace`; gates 3 entry points. |

---

## G. Account & Settings (§5)

| Case | Status | File(s):line | Automatable? | Notes |
|---|---|---|---|---|
| G1 Account blob reachable every tab; breathes when active | **GAP** | `AccountBlob.tsx:16-54`; `AccountScreen.tsx:292` | PARTIAL | Same as SM3 — **Studio home lacks the blob**. Breathe/blink only when `active`. |
| G2 Connect spinner on IG row (not FB), others disable | BLOCKED:P1 | `AccountScreen.tsx:459-471,352` | PARTIAL | Spinner scoped to provider; others `disabled={syncing}`. |
| G3 Disconnect; enabled toggle persists | BLOCKED:P2 | `AccountScreen.tsx:236-253` | PARTIAL | Optimistic flip + persist (reverts on error). Needs synced-accounts data. |
| G4 Edit profile handle/avatar/bio saves everywhere | **GAP** | `EditProfileScreen.tsx:18-176` (handle read-only `:122-126`) | PARTIAL | **Handle is NOT editable** (read-only) — "change handle" unsupported. Name/bio/location/avatar OK. |
| G5 Phone optional, empty allowed | BLOCKED:P2 | `AccountScreen.tsx:255-266,481-501` | PARTIAL | Saves to `users.phone`; empty→null. |
| G6 Password + 2FA → MFA challenge next sign-in | BLOCKED:P1 | `PasswordSetupScreen.tsx:29-42`; `TwoFactorScreen.tsx:48-97`; `RootNavigator.tsx:137-153` | PARTIAL | AAL aal1→aal2 gate on `MfaChallengeScreen`. |
| G7 Block/unblock filters content | BLOCKED:P2 | `blockStore.ts:16-30`; `blocks.ts:4-30`; consumers across Feed/Friends/Threads | PARTIAL | Mutual block filters most surfaces. `AUDIT.md:30` notes residual unfiltered surfaces. |
| G8 Delete account | BLOCKED:P2 | `AccountAdvancedScreen.tsx:94-133`; `account.ts` | PARTIAL | **30-day grace** delete (not immediate purge / auto sign-out) — deferred by design. |

---

## H. Exclusive / Awards (§5)

| Case | Status | File(s):line | Automatable? | Notes |
|---|---|---|---|---|
| H1 Exclusive rail shows gifts/collections | PASS-LIKELY | `ExclusiveRail.tsx:15-66`; `FeedHomeScreen.tsx:206-209`; `exclusive/api.ts:185-215` | PARTIAL | Returns null when empty. Needs seeded award (P7) or DEMO_MODE. |
| H2 Gift reveal grants access | PASS-LIKELY | `GiftRevealScreen.tsx:55-208`; `api.ts:217-219` | PARTIAL | Award **already** grants access server-side; reveal flips `seen_at` only. |
| H3 Exclusive watch granted plays / ungranted gated | PASS-LIKELY / BLOCKED:P2 | `ExclusiveCollectionScreen.tsx:36-53`; `ExclusiveWatchScreen.tsx:76,136`; `api.ts:238-269` | PARTIAL | Ungranted gating enforced by RLS (no rows) — not statically verifiable. |

---

## I. Notifications & Deep Links (§5)

| Case | Status | File(s):line | Automatable? | Notes |
|---|---|---|---|---|
| I1 Permission prompt (Android 13+ runtime, iOS) | PASS-LIKELY | `pushService.ts:48-68`; `AndroidManifest.xml:6` | PARTIAL | Both handled; Android version-gated. |
| I2 Notifications fg/bg/killed, correct copy | BLOCKED:P4 | `pushService.ts:135-189`; `send-push/index.ts` | NO | Copy built by a DB trigger **not in local migrations** — unverifiable statically. |
| I3 Tap notification → deep link | PASS-LIKELY | `pushService.ts:110-120`; `RootNavigator.tsx:52-78` | PARTIAL | Routes award>channel>thread. Needs a real push to tap. |
| I4 Invite universal link `/i/<code>` | **GAP** | none — `InviteManagementScreen.tsx:38`; no AASA/applinks | NO | **Not implemented at all.** Invites are plain-text codes; only `reaxn://` scheme registered. P5 is moot until built. |
| I5 OAuth deep-link return, no lost session | PASS-LIKELY / BLOCKED:P1 | `config.ts:115-147`; `RootNavigator.tsx:230-244` | PARTIAL | Account-sync parsing solid; live round-trip needs P1. |

---

## J. Moderation, Privacy & Safety (§5)

| Case | Status | File(s):line | Automatable? | Notes |
|---|---|---|---|---|
| J1 Flagged clip never uploaded/inserted | PASS-LIKELY (caveat) | `moderateVideo.ts:89-119`; called at 6 recorders incl. `RecordReactionScreen.tsx:97,121` | PARTIAL | **Gate fails OPEN** by design (`:94,97,107,111`) on no-frames/auth/edge error — "never uploaded" only holds when the edge fn returns `allowed:false`. |
| J2 Report / hide; blocked authors filtered | PASS-LIKELY | `ContentActions.tsx:59-91`; `reports.ts:20-32`; `blocks.ts:4-29` | PARTIAL | Report idempotent; block = "I blocked" ∪ "blocked me". |
| J3 Private data hidden from non-members; RLS | BLOCKED:P2 | thread/channel RLS **not in local migrations** | NO | Only `content_reports` + `music_bucket` migrations present locally; verify against prod. |
| J4 No PII in logs; logger no-op in prod | PASS-LIKELY | `logger.ts:13-21` | YES | `__DEV__`-gated; no password/email/token logged (grep clean). |

---

## K. Cross-cutting (§5)

| Case | Status | File(s):line | Automatable? | Notes |
|---|---|---|---|---|
| K1 Offline graceful errors, retries; queue survives bg | **GAP** | `uploadStore.ts:37-43`; `UploadToast.tsx:50-57` | PARTIAL | **No NetInfo, no auto-retry/backoff, no offline detection.** Error pill only. In-memory queue. |
| K2 Upload queue in order, progress, retries | **GAP** | `uploadStore.ts:25-44` | PARTIAL | **Not ordered** (concurrent fire-and-forget); **indeterminate spinner only** (no %); **no retry**. |
| K3 Notch/Dynamic Island + bottom inset | PASS-LIKELY | `useSafeAreaInsets` across 45 files; `Info.plist:88-91` (portrait lock) | PARTIAL | Broad consistent safe-area usage. |
| K4 Performance, no jank, stable memory | NEEDS-DEVICE | runtime only | PARTIAL | Profile on hardware. |
| K5 Back gesture + Android hardware back; nav hides on Studio sub-screens | PASS-LIKELY | `MainTabBar.tsx:431-437`; `ShareHomeScreen.tsx:500-506` | PARTIAL | Hardware-back override only in ShareHome; others rely on default nav. |
| K6 Timestamp localization | PASS-LIKELY | `relativeTime.ts:3-15` | YES | Unit-tested (`relativeTime.test.ts`); 4 branches. |

---

## Defects to fix (front-end, code-level)

These are real GAPs found in code (not blockers) — **not fixed this pass**. Severity per the
plan's §8 guide. Triage in a separate focused cycle.

| # | Case(s) | Defect | Sev | Where |
|---|---|---|---|---|
| D-1 | SM10, K1, K2 | **Upload/bake queues are in-memory only** — no persistence, no resume-after-kill, no ordering, no retry, indeterminate progress. Closest to a data-loss risk. | **Sev-2** | `uploadStore.ts`, `bakeQueueStore.ts`, `pendingReactionsStore.ts` |
| D-2 | C7 | **Floating mic+video record buttons absent on public/members-only channels** (only render in private-chat branch) — directly contradicts the plan. | **Sev-2** | `ChannelScreen.tsx:719-736` |
| D-3 | J1 | **Moderation gate fails open** on edge errors — a flagged clip *can* be uploaded if the edge fn is unreachable. Privacy/safety relevant. | **Sev-2** | `moderateVideo.ts:94,97,107,111` |
| D-4 | SM3, G1 | **Studio home is missing the Account blob** — "reachable from every tab" fails. | Sev-3 | `StudioHomeScreen.tsx:222-232` |
| D-5 | A4, G4 | **Handle is not editable and there's no client dup-handle error** — contradicts A4/G4 expectations (may be intentional; confirm with product). | Sev-3 | `CreateProfileScreen.tsx`, `EditProfileScreen.tsx:122-126` |
| D-6 | E7 | **Resume on an audio-stage draft falls through to Trim**, not Music. | Sev-3 | `StudioHomeScreen.tsx:105-128` |
| D-7 | C2 | **ChannelCard has no last-updated stamp** (`last_message_at` hardcoded null). | Sev-4 | `ChannelCard.tsx:68-71`; `channels.ts:203,270` |
| D-8 | B9 | **Feed rename uses a plain modal, not the branded sheet** used in Messages. | Sev-4 | `FeedHomeScreen.tsx:290-313` |
| D-9 | I4 | **Universal-link invites (`/i/<code>`) are not implemented** (no AASA/applinks). The plan's I4 / blocker P5 test a feature that doesn't exist yet. | Sev-3 (scope) | no impl |
| D-10 | A4 | **No avatar field at profile creation** (plan A4 expects handle/name/avatar). | Sev-4 | `CreateProfileScreen.tsx:54-196` |

**Backend/owner blockers (not code — hand to Owner):** P1 OAuth secrets, P2 prod
migrations (`get_channel_updates_summary`, `create_group_chat`, blocks/thread RLS,
push trigger), P4 push creds, P5 universal links, P6 legal, P7 seeded accounts/content.
The plan also lists three specific P2 migrations: `0007_studio_friend_shares`,
`20260621c_group_chat_dedupe`, `20260621d_channel_updates_last_unseen`.

> ⚠️ Per the standing rule, **no Supabase/backend changes** (migrations, RLS, edge fns)
> were made or are proposed here without Chase's explicit sign-off.
