# Vidrip — Pre-Launch E2E Test Plan

Manual end-to-end QA plan to validate functionality before the beta goes live. Automated E2E
(Maestro/Detox) is a later phase, so this is executed by hand on real devices. Pure-logic Jest
suites (61 tests) already cover the merge/recipe/queue/format logic — this plan covers the
**user-facing flows** that unit tests can't.

## How to use
- Run the **Smoke Test** (§3) first on each platform — if any fails, stop and fix before deeper testing.
- Then work each suite (§5). Mark every case **Pass / Fail / Blocked / N/A** with device + build #.
- Log defects with: case ID, device/OS, steps, expected vs actual, screen recording.
- Re-run the **Regression Checklist** (§6) after any fix.
- Ship only when **Exit Criteria** (§7) are met.

---

## 1. Pre-launch blockers & environment prep
These MUST be done or the corresponding flows can't be tested / will fail in production.

| # | Item | Why it blocks | Owner |
|---|------|---------------|-------|
| P1 | Fill OAuth client IDs in `src/infrastructure/oauth/config.ts` (Google/YouTube, TikTok, Meta/Instagram, Facebook) | Social connect + feed import fail without them | Owner |
| P2 | Apply pending Supabase migrations to prod (`ltpscwticavqutbzrrjb`): `0007_studio_friend_shares`, `20260621c_group_chat_dedupe`, `20260621d_channel_updates_last_unseen` | Studio→friends shares, group-create dedupe, and channel rows in Feed won't work otherwise | Owner |
| P3 | Confirm magic-link emails use the `vidrip.app` host (CF worker) | Sign-in link must resolve | Owner |
| P4 | Verify push (APNs / FCM) credentials + entitlements for the build | Notifications + deep links | Owner |
| P5 | Universal Links / app-store URLs for invite `/i/<code>` landing | Invite acceptance path | Owner |
| P6 | Privacy Policy / TOS reachable + data-controller entity correct | App review + legal | Owner |
| P7 | Seed test accounts: 2+ friends, 1 creator channel w/ posts, 1 members-only channel, 1 group chat, 1 exclusive collection | Needed to exercise social flows | QA |

**Test data needed:** ≥3 user accounts (A = primary, B = friend, C = creator), a real YouTube/TikTok/IG/FB
test asset to share, and a short video to record reactions against.

---

## 2. Device / platform matrix
Test the full plan on at least one device per row; smoke-test the rest.

| Tier | iOS | Android |
|------|-----|---------|
| Primary | iPhone (current iOS, notch + Dynamic Island) | Pixel (current Android) |
| Secondary | Older small iPhone (SE) | Samsung (One UI), low-RAM device |
| Note | Camera/recording **does not work on the iOS Simulator** — use a physical device for all Studio/record/lens cases | Test back-gesture + hardware back button |

---

## 3. Smoke test (critical path — run first, all must pass)
| ID | Scenario | Expected |
|----|----------|----------|
| SM1 | Cold launch → onboarding → sign in via magic link | Lands authenticated on Feed |
| SM2 | Bottom nav: Feed · Channels · Studio(FAB) · Messages · Browse all open | Each tab loads, correct blob/icon, no crash |
| SM3 | Open Account from the top-nav blob (works from every tab) | Account screen opens |
| SM4 | Friend B shares a video to A → A sees it in Feed → taps → doom-react records & saves | Reaction posts; Feed entry clears |
| SM5 | Record + publish a Studio clip (trim→filter→overlay→details→post) | Clip processes to "Live" in Studio |
| SM6 | Browse a shorts feed and send one to a friend | Friend receives it |
| SM7 | Open a Channel, play its intro, react to a video | Reaction recorded |
| SM8 | Create a group chat with 2 friends | Group opens; no duplicate created on retry |
| SM9 | Connect one social account (e.g. Instagram) | Spinner shows on the **correct** row; connects |
| SM10 | Force-quit mid-upload, relaunch | Upload resumes/queues; no data loss; no crash |

---

## 4. (reserved)

## 5. Detailed test suites

### A. Auth & Onboarding
| ID | Scenario | Steps → Expected |
|----|----------|------------------|
| A1 | First-run onboarding | Fresh install → onboarding scenes play → reaches Welcome. Replays only when triggered, not every launch. |
| A2 | Magic-link sign-in | Enter email → "magic link sent" confirmation shows (input not cleared prematurely) → tap link in email → app opens authenticated. |
| A3 | Invite code gate | Enter valid invite code → proceeds to Create Profile with code shown prominently. Invalid/used code → clear error. |
| A4 | Create profile | Set handle/display name/avatar → form fits without scroll → submit → lands on Feed. Duplicate handle → error. |
| A5 | OAuth connect (each: YouTube, TikTok, Instagram, Facebook) | Account → Connect → system browser → authorize → returns to app → row shows connected handle/avatar. |
| A6 | OAuth cancel / deny | Cancel in browser → "Couldn't connect" alert, no spinner stuck, row stays "Connect". |
| A7 | Facebook two-phase | Connect FB → returns Pages list → pick a Page → reels import. Dismiss picker → row shows "Connected, choose a Page" + resume works. |
| A8 | Sign out / back in | State clears on sign-out; re-auth restores account. |

### B. Feed & Doom-React
| ID | Scenario | Expected |
|----|----------|----------|
| B1 | Actionable-only Feed | Only friends/groups/channels with **unseen** items appear; caught-up convos do NOT (they live in Messages). |
| B2 | Friend doom-react chain | Tap a friend entry → opens first pending video → after save, auto-advances through that friend's pending, then the rest → backing out clears the queue. |
| B3 | Channel doom-react | Tap a channel row → starts on its **oldest unwatched** video → chains through the channel → then continues into pending friend/group shares. |
| B4 | Channel rows interleaved | Channels with unseen uploads appear as 📢 rows, sorted by last unseen upload time among friend/group rows. (Requires migration P2.) |
| B5 | Feed badge | Bottom-tab Feed badge = total actionable (friends + groups + channels); updates after reacting. |
| B6 | Sort order | Most-recent activity first across all row types; pull-to-refresh reloads friends + channels. |
| B7 | DrippyEyes / timestamps | Unreplied rows show animated eyes; every row shows a relative timestamp. |
| B8 | Empty state | No actionable items → "You're all caught up". |
| B9 | Group rename | Long-press group → branded rename sheet → save / reset-to-default. |

### C. Channels
| ID | Scenario | Expected |
|----|----------|----------|
| C1 | Browse/explore (algo-sorted) | Channels tab lists public + members-only; private DM "channels" do NOT appear here (they're in Messages). |
| C2 | Channel card | Shows last-updated stamp, **video/post count** (not member count), and a playable **Intro** tile (not a static thumbnail). |
| C3 | Intro video | Tap Intro tile → full-screen autoplay → auto-closes on end / tap to close. |
| C4 | Subscribe / join / invite | Join public; subscribe to gated; accept/decline invite; locked states render correctly. |
| C5 | React to channel post | Open post → Record Your Reaction → records & posts; reaction count increments. |
| C6 | Reviews | After reacting, leave a review; review count updates. |
| C7 | Floating record buttons | Mic + video buttons fixed bottom-right, Studio-style, above the nav, in both empty and populated states. |
| C8 | Members-only video playback | Joined member can watch source videos; non-member is gated. |

### D. Messages & Friends
| ID | Scenario | Expected |
|----|----------|----------|
| D1 | Messages home | Shows all conversations incl. caught-up; **no "to react" entries** (those are Feed-only). Latest-activity timestamps, sorted desc. |
| D2 | Friends context menu | Top-nav Friends blob (Messages only) opens animated menu: Add a friend / Import from contacts / New group chat — not clipped at bottom. |
| D3 | Add a friend | Has a back button to Messages; can add by code/handle. |
| D4 | Import from contacts | Sends invite codes (no phone numbers stored). |
| D5 | New group chat | Slides in from right, preserves bottom nav, no purple gutter; select ≥2 friends → Create. |
| D6 | Group dedupe | Creating a group with the same member set as an existing one opens the existing chat (order-independent). (Requires migration P2.) |
| D7 | Friend conversation | Merged timeline of shares + reactions + DM clips/audio; record video/audio via the floating right-side buttons. |
| D8 | Swipe to hide | Swipe a conversation row → Hide → removed for me only (group/thread not deleted); stays hidden after refresh. |
| D9 | DM audio/video send | Hold mic to record → preview → send; record a video clip → sends to the friend. |

### E. Studio (creation → publish → schedule → collections)
| ID | Scenario | Expected |
|----|----------|----------|
| E1 | Studio as a tab | Studio FAB opens StudioHome **with the bottom nav visible**; no top-right X. Deeper steps (capture/trim/filter/overlay/details) hide the nav. |
| E2 | Capture → Trim | Record or import → trim window applies; >3min (`MAX_STUDIO_MS`) is rejected/clamped. |
| E3 | Filter / adjust | Apply presets + brightness/contrast/saturation/exposure/hue; preview matches. |
| E4 | Lens filters grid | Lens picker shows a true **4-column grid**, edge-to-edge (no right gutter), tabs Beautify/Mask/Warp/Overlay/Interactive switch correctly. |
| E5 | Overlay / stickers | Add text/sticker/animated overlays; they composite in preview. |
| E6 | Publish fork | Details → publish to **a friend(s)** vs **a channel**; each lands in the right place. (Friends path requires migration P2.) |
| E7 | Drafts | Exit mid-flow → draft saved → resume from last saved or raw footage. |
| E8 | Scheduled posts | Set a future release date → post hidden until release passes → appears after. Verify in the "Scheduled" tab. |
| E9 | Collections / exclusive | Create a collection, mark a post exclusive → it appears only inside its collection, gated by award. |
| E10 | Processing status | Uploaded clip shows Uploading→Processing→Live; manual refresh works if webhook is delayed. |

### F. Browse / Share & Reactions (recording engine)
| ID | Scenario | Expected |
|----|----------|----------|
| F1 | Shorts feed | Browse grid plays YouTube/TikTok/IG/creator sources; scroll performance is smooth. |
| F2 | Share to friends | Comment + send buttons (Studio-styled) work; pick friends → share delivered. |
| F3 | Reaction recorder | Source plays + camera records in sync; max 180s cap with countdown. |
| F4 | Face lens during reaction | Lens tracks face (478-pt mesh); selected lens renders live; switching lenses works. |
| F5 | Anonymous mode | Silhouette + voice-mod ("deep") applied; identity obscured in the saved reaction. |
| F6 | Headphones prompt | Recording without headphones surfaces the "use headphones" hint. |
| F7 | Afterthought | (Non-queued reactions) afterthought clip records and attaches. |
| F8 | Intro pre-roll | Sender intro plays once per session per thread, not repeatedly. |

### G. Account & Settings
| ID | Scenario | Expected |
|----|----------|----------|
| G1 | Account blob top-nav | Reachable from every tab; yellow blob breathes/blinks when active. |
| G2 | Social connect spinner | Connecting Instagram shows the spinner **on the Instagram row** (not Facebook); other rows' Connect buttons disable during connect. |
| G3 | Disconnect / toggle | Disconnect a provider; toggle enabled on/off persists. |
| G4 | Edit profile | Change handle/avatar/bio → saves and reflects everywhere. |
| G5 | Phone (optional) | Add/save phone; empty allowed. |
| G6 | Password setup + 2FA | Set password; enable 2FA → MFA challenge on next sign-in. |
| G7 | Block / unblock | Block a user → their content disappears from feed/lists; unblock restores. |
| G8 | Delete account | Account-deletion flow completes; data removed; signed out. |

### H. Exclusive / Awards
| ID | Scenario | Expected |
|----|----------|----------|
| H1 | Exclusive rail | Feed rail shows available gifts/collections. |
| H2 | Gift reveal | Open a gift award → reveal animation → grants access. |
| H3 | Exclusive watch | Granted exclusive video plays; ungranted is gated. |

### I. Notifications & Deep Links
| ID | Scenario | Expected |
|----|----------|----------|
| I1 | Permission prompt | Android 13+ runtime permission requested; iOS prompt shown. |
| I2 | Reaction/channel/award notifications | Received in fg/bg/killed states with correct copy. |
| I3 | Tap notification → deep link | Opens the right screen (thread/channel/award). |
| I4 | Invite universal link | `/i/<code>` opens the app (installed) or store (not installed). (Requires P5.) |
| I5 | OAuth deep link return | Returning from provider browser routes back correctly (no lost session). |

### J. Moderation, Privacy & Safety
| ID | Scenario | Expected |
|----|----------|----------|
| J1 | Video moderation | A flagged clip is **never** uploaded/inserted (gated before publish). |
| J2 | Report / hide | Reporting content + hiding works; blocked authors filtered. |
| J3 | Private data | DMs/private channels not visible to non-members; RLS enforced. |
| J4 | Logging | No PII in logs; logger is a no-op in production builds. |

### K. Cross-cutting
| ID | Scenario | Expected |
|----|----------|----------|
| K1 | Offline / poor network | Graceful errors, retries; upload queue survives backgrounding. |
| K2 | Upload queue | Multiple queued uploads complete in order; progress shown; failure retries. |
| K3 | Orientation / safe areas | Layouts respect notch/Dynamic Island + bottom inset across screens. |
| K4 | Performance | No jank on Feed/Browse scroll, camera open, lens switching; memory stable over a session. |
| K5 | Deep navigation / back | Back gesture + Android hardware back behave; nav bar hides only on Studio sub-screens. |
| K6 | Localization of timestamps | Relative-time stamps render sensibly (today/weekday/date/year). |

---

## 6. Regression checklist (recent changes this cycle)
Verify nothing broke from the production-hardening + feature work:
- [ ] Nav reorg: Feed/Channels/Studio/Messages/Browse + Account/Friends in top nav.
- [ ] Studio is a tab (nav visible on home, hidden on sub-screens); no top X.
- [ ] FriendConversation audio/video buttons float bottom-right (Studio style).
- [ ] ChannelCard shows video count + Intro tile.
- [ ] Group-create dedupe (P2).
- [ ] Channel unseen reactions interleaved into Feed (P2).
- [ ] Doom-react extends through channels then the rest of the feed.
- [ ] Lens picker is a 4-column grid, no right gutter.
- [ ] Account social-connect spinner shows on the correct provider row.
- [ ] Logger gating: no console output in a production build.

## 7. Exit criteria (sign-off to go live)
- All **Smoke Test** cases pass on both iOS + Android primary devices.
- No open **Sev-1/Sev-2** defects (crash, data loss, auth failure, payment/subscribe failure, privacy leak).
- Pre-launch blockers P1–P6 complete and re-verified end-to-end.
- Regression checklist fully ticked.
- `yarn typecheck` (0), `yarn test` (green), and a manual production-build smoke run pass.
- Crash-free session rate validated on a small TestFlight/Internal-testing cohort.

## 8. Severity guide
- **Sev-1**: crash, data loss, can't sign in, privacy leak, payment broken.
- **Sev-2**: core flow blocked (can't react/share/publish), no workaround.
- **Sev-3**: degraded UX, workaround exists.
- **Sev-4**: cosmetic.
