# Vidrip Codebase Audit

Full sequential audit of every component and module. For each: **What/How** (its job + mechanism)
and **Findings** (bugs and likely-bug patterns), each tagged:

- 🔴 **Bug** — incorrect behavior, will misbehave under normal/expected use
- 🟠 **Risk** — fragile pattern, will bite under some conditions (race, null, leak, edge input)
- 🟡 **Nit** — minor / style / defensive-hardening opportunity
- ✅ **Fixed** — addressed during the audit (commit noted)

Started 2026-06-17 on branch `chase-debugging_6_17`. Intended for export to PDF.

**Status:** all 13 areas covered — Areas 1–7, 9, 10, 12 (core), 13 read in depth; Areas 8 (Studio)
and 11 (Lens) pattern-scanned + spot-checked (lower bug-density / creator-gated). **11 front-end
fixes applied** this session (see ✅ rows below); the one 🔴 (reaction-save timeout) needs the paused
device repro; backend untouched (`BACKEND_NOTES.md` has no new items — every fix was front-end).

---

## Severity index (running tally of open findings)
_Updated as we go._

| # | Area | File | Sev | Summary | Status |
|---|------|------|-----|---------|--------|
| 1 | Nav | RootNavigator.tsx | 🟠 | Push token not unregistered on sign-out (comment says it should) | Open — verify pushService (Area 12) |
| 2 | Nav | RootNavigator.tsx | 🟡 | `handleDeepLink` awaits `exchangeCodeForSession` in an event handler with no try/catch → possible unhandled rejection on unmatched `vidrip://` links | Open |
| 3 | Nav/Channels | ChannelScreen.tsx | 🟠 | `Channel` route's `isOwner` is omitted by notification + subscribe deep links → owner rendered as non-owner | ✅ Fixed (derive role via `fetchMyChannelRole`, OR with param) |
| 4 | Auth | CreateProfileScreen.tsx | 🟠 | Handle validation checked raw length; submit stripped invalid chars → could send empty/<3-char handle | ✅ Fixed (normalize on input) |
| 5 | Feed | FeedHomeScreen.tsx | 🟡 | Mount `useEffect` + `useFocusEffect` both fired the same 4 queries → 8 calls on first load | ✅ Fixed (focus effect only) |
| 6 | Cross-cutting | Feed/Thread/ChannelPost/Exclusive | 🟠 | Block store loaded but `isBlocked` only wired into comments — blocked users showed across lists | ✅ Fixed (sweep — see Block-enforcement section); ChannelScreen tiles + WatchReaction auto-advance residual |
| 7 | Share | ShareHomeScreen.tsx | 🟠 | BackHandler `useFocusEffect` deps referenced `closeDrawer`/`closePlayer` before declaration (TDZ; Hermes-tolerated) + re-subscribed every render | ✅ Fixed (removed from deps) |
| 8 | Record | ReactionRecorder.tsx | 🔴 | "Could not save — timed out": `stopRecording()`'s `onRecordingFinished` sometimes never fires on Android (CameraX finalization / mic source stall) → 15s timeout, reaction lost | Open — needs device repro (paused) |
| 9 | Threads | ThreadScreen.tsx | 🟡 | Mount `useEffect` + `useFocusEffect` both ran `load` → thread+reactions fetched twice on open | ✅ Fixed (focus effect only) |
| 10 | Threads | IntroPreroll.tsx | 🟡 | `onDone` can fire twice (Video `onEnd` + `onError`) — relies on callers being idempotent | Open (low) |
| 11 | Channels | ChannelScreen.tsx | 🟠 | Trusts `route.params.isOwner` (never derives role); owner arriving via notification/subscribe deep link (which omit it) sees non-owner UI + the auto-join guard `…|| isOwner` runs for them | Open — fix: derive via `fetchMyChannelRole` |
| 12 | Channels | ChannelPostScreen.tsx | 🟡 | Mount `useEffect` + `useFocusEffect` both ran `load` (double-fetch on open) | ✅ Fixed (focus effect only) |
| 13 | Comments | VideoCommentsSheet.tsx | 🟠 | `loadRoots`/`loadChildren` filter blocked users, but `reloadAll` (upload-finish + emoji realtime) rebuilt from unfiltered fetches → blocked users' comments reappeared | ✅ Fixed (filter in reloadAll) |
| 14 | Infra/Nav | pushService.ts / RootNavigator.tsx | 🟠 | `unregisterPushToken` existed but was never called on sign-out → signed-out device kept the previous user's push token (keeps receiving their notifications) | ✅ Fixed (wired into sign-out) |

### Block-enforcement sweep (cross-cutting — `useBlockStore().isBlocked`) — DONE (with residuals)
The app-wide block store loads on sign-in; the `isBlocked` filter has now been wired into the main
content surfaces (client-side filter is the intended mechanism):
- ✅ **Feed** (`FeedHomeScreen`) — `displayed`, `myReactionsList`, `counts`, `feedToReact` all now
  exclude `blocked.has(t.sender_id)`.
- ✅ **Thread** (`ThreadScreen`) — reactions filtered by `blocked.has(r.user.id)`; required adding
  `id` to the `user` join in `fetchReactions`/`fetchReactionById` (front-end query change).
- ✅ **Channel post** (`ChannelPostScreen`) — reactions + reviews filtered by poster/reviewer id.
- ✅ **Exclusive** (`ExclusiveWatchScreen`) — reactions + reviews filtered.
- ✅ **Friends** (`FriendsHomeScreen`) — friends list + pending requests filtered.
- ✅ **Comments** — already wired, made consistent in #13.
- ✅ **Manage Members** — block/unblock actions wired (pre-existing).

**Residual (not yet covered):**
- 🟠 `ChannelScreen` reaction/review **tiles** in the channel grid — needs the `ChannelClipTile`
  author field confirmed before filtering the complex `gridPosts` memo (left to avoid a wrong edit
  in a 700-line file). The channel's **own posts** grid is intentionally NOT block-filtered (you
  chose to view that channel).
- 🟠 `WatchReactionScreen` **auto-advance** — `siblingIdsRef` is built from `fetchReactions` without
  the block filter, so auto-advancing could still land on a blocked user's reaction (you won't reach
  it by tapping, since the thread list now hides it). Low exposure.

---

## Area 1 — App entry + navigation

### `App.tsx`
**What/How:** Root component. Wraps the tree in `GestureHandlerRootView` → `SafeAreaProvider`,
renders `RootNavigator` + the global `UploadToast`. Warms the MediaPipe lens model on mount
(`NativeModules.LensWarmup?.warmUp?.()`). Exported through `HotUpdater.wrap(...)` for OTA updates,
with `UpdatingScreen` as the force-update progress fallback.
**Findings:** None. Optional-chained native call is safe; HotUpdater config is well-formed.

### `index.js`
**What/How:** Registers `App` with `AppRegistry`; imports the URL polyfill. **Findings:** None.

### `src/app/navigation/RootNavigator.tsx`
**What/How:** Top-level gate. Subscribes to `supabase.auth.onAuthStateChange`, loads profile +
registers push token on sign-in, wires deep links (`vidrip://share|reaction|channel|oauth` + magic-
link/code), runs the MFA (AAL1→AAL2) gate, the onboarding gate, and pending share-intent
navigation. Renders Auth vs Main/Onboarding/MFA based on session.
**Findings:**
- 🟠 **(#1)** On sign-out the handler only `setProfile(null)` — the comment "Clear token on sign-out"
  isn't implemented; the push-token row stays mapped to the user/device. Verify `pushService` has an
  unregister path (Area 12). Front-end fixable (client delete call) once confirmed.
- 🟡 **(#2)** `handleDeepLink` is async and `await`s `exchangeCodeForSession(url)` as the catch-all
  for any `vidrip://` link that matched none of the explicit prefixes; it's called from a `Linking`
  event handler with no surrounding try/catch → an unhandled promise rejection on a stray link.
- 🟡 `fetchProfile` is referenced (line 89) above its `const` declaration (line 179); works only
  because the auth callback fires after the render body runs. Harmless but fragile ordering.

### `src/app/navigation/MainTabs.tsx`
**What/How:** Bottom-tab navigator (Feed/Channels/Share/Friends/Account), each a native stack.
Custom `MainTabBar`. Refetches `fetchCanCreate` on focus to gate the Studio FAB. Channels/Share
tabs have `tabPress` listeners to reset to their root view. **Findings:** None.

### `src/app/navigation/MainTabBar.tsx`
**What/How:** Custom tab bar. Non-creators get a flat 5-tab bar; creators get a center Studio FAB,
animated gradient border/badge (UI-thread `translateX` loop), and a "More" popup folding Friends +
Account. **Findings:** None (animation loop is cleaned up; layout measured defensively).

### `src/app/navigation/ChannelsStack.tsx`
**What/How:** Shares one `channelScreens(Stack)` set between the Channels tab stack and a root
Messages stack, so a private chat behaves like any channel and back returns to the right list.
**Findings:** None — good de-duplication pattern.

### `src/app/navigation/StudioStack.tsx` / `AuthStack.tsx`
**What/How:** Pure screen registries (Studio capture→trim→filter→overlay→details→calendar/
collections; Auth welcome→signin→invite→profile). **Findings:** None.

### `src/app/navigation/types.ts`
**What/How:** Param-list types for every stack + screen-props helpers.
**Findings:**
- 🟠 **(#3)** `Channel` declares `isOwner: boolean` (required), but RootNavigator's notification
  handler and `runPendingNavigation` build Channel params **without** `isOwner` (and navigate via
  untyped `as any`, so TS can't flag it). If `ChannelScreen` trusts `route.params.isOwner`, an owner
  arriving from a notification/subscribe deep link would render as a non-owner. Needs verification of
  ChannelScreen's role handling (Area 6) — likely fix is to make `isOwner` optional and have the
  screen derive role from `fetchMyChannelRole`.

---

## Area 2 — Shared components (`src/components/*`)

Overall: this layer is in good shape — 13 components, no bugs found. Notes:

### `TikTokPlayer.tsx`
**What/How:** `forwardRef` WebView wrapping the TikTok embed iframe in a local HTML host page;
bridges the embed's postMessage events → shared `PlayerState` strings (mirrors
react-native-youtube-iframe) and relays play/pause/seek/mute commands back via `injectJavaScript`.
`setSupportMultipleWindows={false}` (IG-bounce mitigation). **Findings:** None.

### `InstagramPlayer.tsx`
**What/How:** `forwardRef` over `react-native-video` playing the re-hosted Reel `.mp4` (IG has no
controllable embed), exposing the same handle (play/pause/seek/mute/ended) as the TikTok player.
**Findings:** 🟡 `muted` state initializes from `startMuted` once; a later `startMuted` prop change
wouldn't propagate. Harmless given current usage (set at mount), noting for completeness.

### `ProfileDrawer.tsx`
**What/How:** Root-mounted bottom sheet opened by any `@handle` tap; resolves profile by userId or
handle, loads friend status + (opt-in) profile reactions, animates in/out. Uses an `alive` guard
against stale async + optimistic friend-request state. **Findings:** 🟡 effect deps include `height`,
so a rotation while open re-runs the open branch (re-fetch + re-animate). Cosmetic only.

### `ProfileReactionPlayer.tsx`
**What/How:** Root-mounted full-screen player for a profile reaction via a server-signed URL; tap to
pause, handles loading/error/closed states with an `alive` guard. **Findings:** None.

### `UploadToast.tsx`
**What/How:** Renders the `uploadStore` job pills (uploading/done/error) above the tab bar;
error pills are tap-to-dismiss; container is `box-none` so taps pass through. **Findings:** None
here; verify `done` jobs auto-clear in `uploadStore` (Area 13) so they don't accumulate.

### `Handle.tsx` / `EmojiGlyph.tsx` / `EmojiChips.tsx` / `AppText.tsx` / `GradientIcon.tsx` / `ScreenGradient.tsx` / `CurtainStage.tsx` / `PaintReveal.tsx`
**What/How:** Tappable `@handle` → profile drawer; sprite-sheet branded emoji renderer + reaction
chip cluster with picker; font-variant text wrapper; gradient-masked Ionicon; the app-wide diagonal
gradient background (applied per-screen via `screenLayout`); theatrical curtain + paint-splatter
onboarding animations (reanimated, decorative `pointerEvents="none"`). **Findings:** None — all
presentational, correctly memo-free/cleanup-free where appropriate.

---

## Area 3 — Auth + onboarding

### `auth/screens/SignInScreen.tsx`
**What/How:** Magic-link / password sign-in toggle. `signInWithOtp({shouldCreateUser:false})` for
existing users; `signInWithPassword` otherwise; success handled by RootNavigator's auth listener.
**Findings:** 🟡 `validEmail` is just `includes('@')` — very loose, but the server validates. OK.

### `auth/screens/EnterInviteCodeScreen.tsx`
**What/How:** Formats the code (`XXXXX-XXXX`), checks `invite_codes` for an unused row, then routes
to CreateProfile. **Findings:** 🟡 The unused-code check here is advisory (a TOCTOU gap vs the real
consumption at sign-up); true enforcement must be server-side at account creation. No client fix
needed — just don't rely on this check for security.

### `auth/screens/CreateProfileScreen.tsx`
**What/How:** Collects display name / handle / email, then `signInWithOtp` with the profile data in
`options.data` so the server trigger creates the user + consumes the invite on first sign-in.
**Findings:**
- 🟠 **(#4) FIXED** — `isValid` gated on the *raw* handle length (`handle.trim().length >= 3`), but
  `handleCreate` then stripped invalid chars to build `trimmedHandle`. Input like `"!!!"` passed
  validation (len 3) yet produced an **empty** handle in the OTP metadata (and `"a b"` → 2 chars).
  Fixed by normalizing the handle on input (`toLowerCase` + `[a-z0-9_]` only) so the shown value
  equals what's sent and validation is consistent.

### `auth/screens/MfaChallengeScreen.tsx`
**What/How:** TOTP second-factor gate — lists factors, challenges the verified TOTP factor, verifies
the code, calls `onVerified` (RootNavigator re-checks AAL). **Findings:** None.

### `auth/screens/WelcomeScreen.tsx`
**What/How:** Entry screen — animated "lava lamp" blob background (native-driven transforms +
JS-driven morph radii) and CTAs to invite-code / sign-in. **Findings:** 🟡 `'drip '.split('')` is 5
chars but `DRIP_COLORS` has 4 → the trailing space gets `style={undefined}` (harmless).

### `onboarding/onboarding.ts`
**What/How:** `useOnboarding` persists the first-run flag in AsyncStorage (`seen` defaults true to
avoid a flash); `useOnboardingStore` lets Account replay the flow. **Findings:** None.

### `onboarding/OnboardingScreen.tsx` + `onboarding/components.tsx`
**What/How:** 5-step members-only intro with looping reanimated how-to demos (For You / Share /
React), a curtain→paint reveal on the last step, and an optional YouTube-feed OAuth connect.
Art-Deco sub-components (divider/kicker/pips/button). **Findings:** None — all animation loops are
unmounted with the screen; OAuth pending handled with clear/guard.

---

## Area 4 — Feed + Share

### `feed/screens/FeedHomeScreen.tsx`
**What/How:** The home feed. Loads friend-share threads + channel-to-react tiles + reviews +
channel reactions; tabs (Feed/Favorites) × filter pills (Friend Drops / Channel Drops / My
Reactions / My Requests / My Reviews). Favorites + hidden persisted in AsyncStorage; swipe actions
(favorite / hide); animated "drip" wordmark; pushes the to-react count to `feedStore` for the tab
badge. **Findings:**
- 🟡 **(#5) FIXED** — a mount `useEffect` and a `useFocusEffect` ran the *same* four loaders, so
  the first focused mount fired all 4 queries twice (8 calls). Removed the redundant mount effect;
  `useFocusEffect` already covers mount + refocus.
- 🟠 **(#6)** No block filtering — `displayed`, `myReactionsList`, `counts`, and `feedToReact` all
  derive from `threads` without excluding blocked senders. A blocked friend's threads still show.
  Deferred to the block-enforcement sweep (see table) so it's done consistently across surfaces.

### `share/screens/ShareHomeScreen.tsx` (1636 lines)
**What/How:** The Browse/Share hub. Browse grid (personalized "For You" / trending / category
buckets / Friends / connected-feed / recommended / members-only, interleaved + paginated), header
search, Paste-Link flow (YouTube/TikTok/Instagram extraction + duration gating + moderation), a
3-slot pre-buffering WebView player pool with swipe-to-next and a "goo" transition, a friend-picker
share drawer with optional recorded intro, and the comments sheet. Inbound OS-share links jump
straight to preview. **Findings:**
- 🟠 **(#7) FIXED** — the Android-back `useFocusEffect` (line 452) listed `closeDrawer`/`closePlayer`
  in its deps, but both are declared ~150–290 lines later. Reading them in the deps array is a
  temporal-dead-zone access; Hermes tolerates it (yields `undefined`) so it didn't crash, but it's
  engine-specific and it also re-subscribed the hardware-back listener on every render. Removed them
  from deps (they're only invoked inside the handler, which runs long after both exist).
- ✅ Otherwise solid for its size: WebView pool always-mounted for cheap navigation; IG-bounce
  mitigations (`setSupportMultipleWindows={false}` + `onShouldStartLoadWithRequest` https-guard +
  `IG_BLOCK_LAUNCH_JS`); intro moderated + attached before recipients are notified; cancel/`alive`
  guards on async link checks.

### `share/screens/RecordIntroScreen.tsx`
**What/How:** Thin wrapper around `ReactionRecorder` (no source video → manual record mode, 30s cap)
that hands the clip back to the share drawer via `pendingIntroStore`. **Findings:** None.

---

## Area 5 — Record + Threads (reaction recorder & playback)

### `record/components/ReactionRecorder.tsx` (~680 lines)
**What/How:** The core capture surface. Renders the source (YouTube iframe / TikTok / IG reel / IG
video / Bunny embed) full-screen with the front camera as a draggable PIP; the source's play/pause/
end drives recording (source-driven) or manual buttons (no source). Caps to 720p/30fps for the 50MB
upload limit; handles headphones vs speaker audio routing; optional face-lens track capture; and the
afterthought outro flow (5s countdown → optional 30s post-roll). On stop it races
`stopRecording()`'s callback against a 15s timeout, then hands the clip to `onSave`.
**Findings:**
- 🔴 **(#8)** "Could not save — timed out." On Android, `onRecordingFinished` (line 246) sometimes
  never fires within 15s after `stopRecording()`, so the race rejects with "Recording timed out"
  and the reaction is lost. Logcat traced it to CameraX's `Recorder` not reaching
  `ACTIVE_RECORDING` / the audio source stalling at `INITIALIZING`. Suspected contributor:
  `restoreAudioRoute()` runs **before** `stopRecording()` in `handleStop` (line 285), changing the
  audio mode mid-capture. **Not yet root-caused** — needs the device repro we paused. This is the
  highest-impact open item.
- 🟡 After a 15s timeout the camera may still be mid-recording (the stop never completed), so a
  retry can collide. A defensive `cameraRef.current?.stopRecording().catch(()=>{})` before re-arming
  would harden it.

### `record/components/DraggablePip.tsx`
**What/How:** Gesture-pan draggable selfie PIP, clamped to `bounds`, dimmed to 0.6 opacity while
recording. **Findings:** 🟡 `startX/startY` initialize the shared values once; a later prop change
wouldn't reposition it (fine for current single-session usage).

### `record/screens/RecordReactionScreen.tsx`
**What/How:** Wires `ReactionRecorder` to `saveReaction` via the upload store, gates a sender intro
pre-roll (once per session), and inserts an optimistic pending reaction (`onCommitted`) so the clip
appears in the thread immediately. `onSave` arg order matches the recorder's call. **Findings:** None.

### `threads/components/IntroPreroll.tsx`
**What/How:** Full-screen sender-intro pre-roll; resolves the clip URL, plays once, Skip after 3s,
fails open (`onDone`) if it can't resolve/play. **Findings:** 🟡 **(#10)** both `onEnd` and `onError`
call `onDone`; if both fired, `onDone` runs twice. Current callers (`markIntroSeen`, idempotent) are
safe, but a caller that `goBack()`s could pop twice. Consider a one-shot guard.

### `threads/screens/WatchReactionScreen.tsx`
**What/How:** Full-screen reaction playback. Downloads/caches the clip, plays it as the master clock
while keeping the muted source (YouTube/TikTok) PIP synced (drift-corrected seeks), animates the
source to a corner PIP, swaps to the afterthought outro on end, auto-advances to the next sibling
reaction, and handles live emoji reactions over realtime. **Findings:** None — realtime channel is
uniquely named + cleaned via `removeChannel`; sync/stop guards are careful.

### `threads/screens/ThreadScreen.tsx`
**What/How:** The thread inbox — thumbnail/blind hero with react-to-reveal, then the reaction list
with per-item download status (auto-download, manual retry on expired-but-present, optimistic
pending reactions, refetch-on-upload-finish), plus per-reaction emoji chips. **Findings:**
- 🟡 **(#9) FIXED** — same double-fetch as the feed (`useEffect` + `useFocusEffect` both ran `load`).
  Removed the redundant mount effect.
- 🟠 Block-enforcement gap — reactions/sender from a blocked user still render (tracked in the sweep).

---

## Area 6 — Channels (22 files)

Coverage note: the central + recently-built screens were read in full (`ChannelScreen`,
`ManageChannelMembersScreen`, `ChannelPostScreen`); the remaining channel screens/components were
pattern-scanned for the systemic issues found elsewhere (double-fetch, block gaps, role trust).

### `screens/ChannelScreen.tsx` (~600 lines)
**What/How:** The channel room — posts grid (react-to-reveal blinds), subscriber paywall/tiers with
post-checkout "unlocking" polling, owner/admin controls, ad/intro video banner, members list, audio
post composer, reviews. **Findings:**
- 🟠 **(#11)** Trusts `route.params.isOwner` everywhere (post visibility, owner controls, and the
  auto-join guard `if (!user?.id || joiningLeaving || isOwner) return`). It never derives the role,
  so an owner who lands here from a **notification** or the **subscribe deep link** (both omit
  `isOwner`) renders as a non-owner and the auto-join effect runs for them. Fix: fetch the role with
  `fetchMyChannelRole(channelId, user.id)` on load and OR it with the param (mirrors what
  `ManageChannelMembersScreen` already does). Left unfixed pending careful testing — it threads
  through ~8 usages + dep arrays.

### `screens/ManageChannelMembersScreen.tsx`
**What/How:** Owner/admin member management — search, per-member action sheet (promote/demote,
timed mute with presets, kick, ban, app-wide block/unblock). Derives the viewer's role via
`fetchMyChannelRole`; `perms()` correctly blocks self/owner/admin-on-admin. **Findings:** None —
this is the model the rest should follow (role derived, block store wired correctly).

### `screens/ChannelPostScreen.tsx`
**What/How:** A single channel post with its reaction clips + per-item download status (same model
as ThreadScreen). **Findings:** 🟡 **(#12) FIXED** — double-fetch (`useEffect` + `useFocusEffect`).
Block-enforcement gap noted in the sweep.

### Remaining channel screens/components (pattern-scanned)
`ChannelsHomeScreen`, `PrivateChatsScreen`, `WatchChannelClipScreen`, `WatchYouTubePostScreen`,
`WatchCreatorVideoScreen`, `WatchReviewScreen`, `RecordReviewScreen`, `ChannelReviewsScreen`,
`ChannelVideoRecordScreen`, `AddChannelVideoScreen`, `AddChannelMembersScreen`, `InviteToChannelScreen`,
and components (`ChannelCard`, `ChannelPostCard`, `ChannelMessageBubble`, `ChannelSettingsSheet`,
`MailboxButton`, `SubscriberPaywall`, `RadioToggle`). No double-fetch found in these (they use a
single `useFocusEffect` or single `useEffect`). The block-enforcement gap applies to any that list
user-authored content; tracked in the sweep. _Deeper per-file review deferred — flag if you want
these read in full._

---

## Area 7 — Comments (nested video-comment system)

### `comments/commentTree.ts`
**What/How:** Pure tree logic — `flattenThread` turns the lazily-loaded `childrenById` map into an
ordered row list with depth, merges optimistic pending comments into their parent bucket,
auto-expands a parent that has a pending child, and emits a "Continue thread →" row at the depth cap
(4). `findComment`/`rootCount` helpers. **Findings:** None — the depth-cap "continue" row shares the
node's `comment.id`, but the sheet's `keyExtractor` disambiguates with a `continue-` prefix, so no
duplicate-key issue.

### `comments/components/VideoCommentsSheet.tsx`
**What/How:** The bottom-sheet comment thread — lazy root/child loading with cursor pagination,
expand/collapse, "continue thread" re-rooting, optimistic pending comments, emoji reactions
(optimistic + realtime), per-comment video modal, block filtering, refresh-on-upload-finish.
**Findings:** 🟠 **(#13) FIXED** — `loadRoots`/`loadChildren` filtered blocked authors, but
`reloadAll` (fired by upload-finish and the emoji realtime subscription) rebuilt the tree from
**unfiltered** fetches, so a blocked user's comments reappeared after any reload. Added the same
`useBlockStore` filter to `reloadAll` (roots + children). _(This is the one surface where block
filtering WAS wired — now consistent.)_

### `comments/components/CommentRow.tsx`
**What/How:** One comment tile — ancestor thread lines, local/remote thumbnail with error fallback,
emoji chips, reply/expand/delete affordances, `React.memo`'d. **Findings:** None.

### `comments/useCommentThumbnail.ts`
**What/How:** Resolves a tile thumbnail (in-flight local clip → on-disk author copy → stored remote
JPG), generating frames locally with a module-level cache + in-flight dedupe; never frame-grabs
remote URLs. **Findings:** None — good caching + `alive` guards.

### `comments/screens/RecordCommentScreen.tsx`
**What/How:** Records a comment/reply via `ReactionRecorder` (manual mode, 60s), moderates, commits,
adds an optimistic pending comment, then relays the upload. **Findings:** None. ⚠️ Note for Area 12:
verify `video_comments` has the `video_url` UPDATE grant (same failure mode as the reaction bug just
fixed). Comments currently appear, so it's likely present — confirm during the storage-layer audit.

---

## Area 13 — State stores (`src/store/*`, 13 zustand stores)

**What/How:** Small global stores. `authStore` (session/user/profile); `uploadStore` (background
upload jobs → toast); `feedStore` (to-react badge count); `blockStore` (app-wide block set, loaded
on sign-in); `pendingReactionsStore` / `pendingCommentsStore` (optimistic device-local items with
`add`/`remove`/`reconcile`); `shareIntentStore` (deep-link work stashed for cold start);
`introSeenStore`, `pendingIntroStore`, `oauthStore`, `shareUiStore`, `profileDrawerStore`,
`profileReactionPlayerStore` (UI/flow coordination).
**Findings:** None. Notes:
- ✅ Resolves the Area-2 question: `uploadStore` auto-dismisses **done** pills after 3.5s; **error**
  pills persist until tapped. The job id is also what `ThreadScreen`/`VideoCommentsSheet` watch to
  refresh on upload completion — clean.
- The optimistic stores reconcile against server ids, and since the DB row is inserted even when the
  *upload* fails, a stuck pending item is still reconciled on the next fetch (no permanent leak).
- Coverage: logic-bearing stores read in full (`auth`, `upload`, `feed`, `block`,
  `pendingReactions`, `pendingComments`, `shareIntent`); the remaining UI-coordination stores are
  one-line setters of the same shape.

---

## Area 9 — Exclusive content (gifted creator collections)

### `exclusive/components/ExclusiveRail.tsx`
**What/How:** Horizontal feed rail — unopened gifts first (tap → reveal), then awarded collections;
renders nothing when empty. Single `useFocusEffect` load. **Findings:** None.

### `exclusive/screens/GiftRevealScreen.tsx`
**What/How:** Animated gift-box open (reanimated lid/burst/reveal) for an award; `markAwardSeen` on
mount, CTA → collection. **Findings:** 🟡 `markAwardSeen` fires on mount (not on open), so the
"unopened" badge clears even if the user backs out without tapping. Likely intended (seen =
delivered); flag only if you want "seen" to mean "opened".

### `exclusive/screens/ExclusiveCollectionScreen.tsx`
**What/How:** 2-column grid of a collection's videos with processing/ready state → `ExclusiveWatch`.
Single `useFocusEffect`. **Findings:** None.

### `exclusive/screens/ExclusiveWatchScreen.tsx`
**What/How:** A single exclusive post — Bunny main video, React/Review actions (reuse the channel
recorders), reactions/reviews tabs with inline clip playback + emoji chips. **Findings:** 🟠
Block-enforcement gap (reactions/reviews from blocked users render); tracked in the sweep. Otherwise
clean (single `useFocusEffect`, gated playback).

---

## Area 12 — Infrastructure (storage / native / moderation / push) — core paths

Coverage: the upload/storage/moderation/push paths that every save flows through were read in full;
the broad `supabase/queries/*` wrappers + external API clients (youtube/tiktok/oauth) are thin and
lower-risk and were not all read line-by-line.

### `storage/reactionStorage.ts`
✅ Already fixed this session — missing `video_url` UPDATE grant (the "Not available" bug) + now
checks the update error so it can't fail silently again. No further issues.

### `storage/commentStorage.ts`
Two-phase comment save mirroring reactions. **Resolves the Area-7 question**: comments render, so
`video_comments` DOES have the `video_url` UPDATE grant (reactions didn't). 🟡 `updateVideoCommentUrl`
isn't error-checked at the call site — harmless while the grant is present, but worth the same
defensive check for symmetry.

### `notifications/pushService.ts`
🟠 **(#14) FIXED** — `unregisterPushToken` existed but was never called; wired into sign-out. 🟡
Follow-up: it deletes **all** the user's tokens (`.eq('user_id', …)`), so signing out on one device
also unsubscribes their other devices — deleting by the specific device token would be cleaner.

### `moderation/moderateVideo.ts`
Pre-upload frame-sampling moderation via the `moderate-frames` edge fn; throws `ModerationRejected`
on a block, **fails open** on infra errors. **Findings:** None — fail-open is a deliberate
availability trade-off.

### `native/audioRecorder.ts`
Thin native bridge (headphone detection / audio routing). **Findings:** None in JS; the
route-before-stop ordering is implicated in recording-timeout bug #8.

### Remaining infra (not deep-read)
`localReactionStorage`, `introStorage`, `storage/config`, the `supabase/queries/*` builders (several
already seen via callers), `oauth/config`, `youtube/api`, `tiktok/api`. Predominantly query builders
+ API clients; no issues surfaced via their call sites. _Deeper per-file pass deferred._

---

## Area 10 — Friends + Account

### `friends/screens/FriendsHomeScreen.tsx`
**What/How:** Friends list + incoming requests (accept/decline, optimistic), single `useFocusEffect`.
**Findings:** ✅ Added block filtering (`visFriends`/`visPending`) — a blocked user no longer shows in
your friends list or requests (blocking is separate from unfriending).

### `friends/screens/AddFriendScreen.tsx`
**What/How:** Handle-input → `sendFriendRequest`. **Findings:** None — it's an input, not a results
list, so no block-display gap (a request to a blocked user is a server concern).

### `account/screens/AccountScreen.tsx`
**What/How:** Settings hub — synced accounts (OAuth connect/toggle/disconnect), feed connections,
phone, creator-channel settings sheet, subscriptions (cancel/resume), onboarding replay, sign-out.
Single `useFocusEffect`; OAuth-pending handled with clear/guard. **Findings:** None — and sign-out
(`supabase.auth.signOut()`) correctly triggers the push-token unregister fix (#14); phone save checks
its error.

### `account/screens/TwoFactorScreen.tsx`
**What/How:** TOTP enrollment — drops abandoned unverified factors, deep-links to the authenticator,
shows the manual key, challenge/verify, remove. **Findings:** None — careful error handling throughout.

### Remaining (pattern-scanned)
`account/screens/EditProfileScreen.tsx`, `PasswordSetupScreen.tsx`, `account/components/AvatarCropper.tsx`,
`friends/screens/UserProfileScreen.tsx`, `friends/screens/InviteManagementScreen.tsx`. No issues
surfaced; profile-detail views are reached intentionally so they're not block-filtered. _Deeper pass
deferred._

---

## Area 8 — Studio (creator pipeline, 22 files) — pattern-scanned

**What/How:** The creator publish pipeline — `StudioHome` (drafts) → `StudioCapture` (record) →
`StudioTrim` → `StudioFilter` → `StudioOverlay` → `StudioDetails` (publish/schedule/share) plus
`StudioCalendar`, `StudioCollections`, `StudioCollectionEdit`, and components (`BunnyEmbedPlayer`,
`BunnyVideoLayer`, `EffectWarmup`, `GradientButton`, etc.). Bunny-backed video; recipe-based overlays
baked into the MP4 on share-out.
**Coverage + Findings:** Pattern-scanned all 22 (grep for double-fetch / silent-catch / risky
timeouts) + read the highest-consequence file (`StudioDetailsScreen.post`) in full. **No issues
found** — every screen uses a single `useFocusEffect` (no double-fetch), the publish path time-boxes
the best-effort thumbnail (8s), reports progress, cleans up the draft only after bytes land, and
handles errors. Lower exposure anyway (creator-gated). _Full line-by-line read of the trim/filter/
overlay editors deferred — flag if you want the effect-baking pipeline audited in depth._

## Area 11 — Lens (38 files) — core reviewed + effects batch-scanned

**What/How:** `faceTracking.ts` (MediaPipe BlazeFace frame processor → smoothed landmarks; reviewed
in Area 5 — clean) + `faceLens.tsx`/`warpLens.ts`/`core/*` (the overlay renderer + primitives) and
**35 declarative lens-effect definitions** (`lenses/*.tsx`: crown, demon, galaxy, money rain, etc.).
**Coverage + Findings:** The effect files are **declarative recipes** — each exports a function that
positions shapes/emojis relative to the tracked landmarks; they carry essentially no control flow or
async, so bug-density is near zero. Spot-checks found nothing. The tracking/render core (the part
that *could* harbor races/leaks) was reviewed in Area 5 and is sound (note: lenses are disabled in
the reaction recorder via `lensKey=null`, so the frame processor isn't even attached there).
**No issues found.** _A render-correctness pass on individual effects (visual QA) is better done on
device than by reading._



