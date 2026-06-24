# Vidrip E2E (Maestro)

Automated end-to-end flows for the **Pre-Launch E2E Test Plan (2026-06-21)**. One flow
file per plan case, so the suite traces 1:1 to the plan (SM1–SM10, A1–K6).

The companion **[`../E2E_AUDIT.md`](../E2E_AUDIT.md)** holds the static audit + defect
catalog: every case's `PASS-LIKELY / GAP / BLOCKED:Pn / NEEDS-DEVICE` status and the
list of real code defects found (catalog-first; not yet fixed).

---

## Why Maestro (not Detox)

Maestro drives the same YAML flows on real iOS **and** Android devices with **no native
build instrumentation** — critical here because the plan's §2 note says camera/recording
won't run on the iOS Simulator, and this app leans on vision-camera / Skia / Reanimated /
WebViews that Detox would fight. Maestro selects by visible text, accessibility `id`
(React Native `testID`), or `accessibilityLabel`, and tolerates the app's heavy animation.

---

## Prerequisites

1. **Install Maestro** (not an npm dep): https://maestro.mobile.dev — `maestro` must be on PATH.
2. **A real device** (or emulator for non-camera flows). Camera/Studio/lens/recorder cases
   are tagged `needs-device` and must run on hardware.
3. **A built app installed** on the device:
   - Android `com.vidrip` · iOS `com.isphillips.vidrip`.
4. **Seeded accounts & content (blocker P7)** — see `vars/local.env.example`. E2E signs in
   with **password auth**, so each test account must have a password set
   (Account → Password Login), not magic-link-only.
5. **Other blockers** gate whole suites — see the tag table below and `E2E_AUDIT.md`.

### Auth automation

The plan's sign-in is a **magic link**, which can't be intercepted headlessly. The suite
substitutes **password sign-in** of seeded account A (`helpers/signIn.yaml`) — same
authenticated end state. The magic-link path itself (A2) is verified **manually**. The
helper also walks first-run onboarding (`DRIP IN → Skip for now → NEXT → NEXT → LET ME IN`)
when a `clearState` exposes it.

---

## Running

```bash
# 1. Copy the env template and fill in real values (gitignored)
cp .maestro/vars/local.env.example .maestro/vars/local.env

# 2. Smoke first — the plan says STOP and fix if any smoke case fails
yarn e2e:smoke

# 3. A single suite (set the tag)
SUITE=suite-B yarn e2e:suite

# 4. Everything
yarn e2e

# Exclude device/blocked cases on an emulator / pre-blocker run:
maestro test .maestro --include-tags smoke \
  --exclude-tags needs-device,blocked-p1,blocked-p2,blocked-p4,blocked-p5 \
  --env-file .maestro/vars/local.env
```

`config.yaml` runs the smoke flows in SM1→SM10 order with `continueOnFailure: true`.

---

## Layout

```
.maestro/
  config.yaml              workspace config (flow discovery + smoke order)
  vars/local.env.example   APP_ID, seeded accounts, content fixtures (copy → local.env)
  helpers/                 reusable subflows (NOT run standalone)
    freshLaunch.yaml         clearState + launchApp (signed-out start)
    signIn.yaml              password sign-in of a seeded account (+ onboarding walk)
    goToTab.yaml             tap a bottom-nav tab by env TAB
  smoke/                   SM1–SM10 (tag: smoke)
  suites/
    A_auth/  B_feed/  C_channels/  D_messages/  E_studio/
    F_browse/  G_account/  H_exclusive/  I_notifications/
    J_moderation/  K_crosscutting/      (tags: suite-A … suite-K)
    <dir>/_NOTES.md          cases with no meaningful UI flow (backend/OS/logic) —
                             documents how each is verified instead
```

## Tags

| Tag | Meaning |
|---|---|
| `smoke` | §3 smoke case — run first. |
| `suite-A` … `suite-K` | §5 detailed suite. |
| `needs-device` | Camera/recording/native/gesture — physical device only. |
| `needs-seed` | Requires P7 seeded accounts/content to be meaningful. |
| `blocked-p1` | OAuth client secrets. |
| `blocked-p2` | Supabase prod migrations / RLS / edge fns. |
| `blocked-p4` | Push (APNs/FCM) credentials. |
| `blocked-p5` | Universal links (note: feature not implemented — see `E2E_AUDIT.md` D-9). |

---

## `testID` backlog (raises automation coverage)

This pass added the smoke-critical testIDs (tab bar, FAB, Account/Friends blobs, sign-in).
The suite agents flagged these **un-IDed controls** — adding them turns several `PARTIAL`
flows into robust ones. None added yet (kept this pass additive + reviewable):

- **Account:** creator-mode `<Switch>` (`account-creator-switch`); per-provider enable
  `<Switch>` (`creator-enabled-<provider>`); per-provider Connect button
  (`connect-<provider>`); phone input (`account-phone-input`).
- **ContentActions** (`src/components/ContentActions.tsx`): ellipsis trigger, Report/Block
  rows (`content-actions-trigger` / `-report` / `-block`).
- **Browse player:** comments + send icons (`share-comments` / `share-send`); share-drawer
  friend rows + Send button.
- **Reaction recorder:** record/stop/restart/exit controls, lens pill, countdown badge,
  afterthought buttons.
- **Studio:** Capture close (X), draft rows, per-row status refresh, collections/calendar
  header icons.

---

## Known limitations

- **Magic-link sign-in (SM1/A2)** can't be headless — password auth is used; A2 is manual.
- **`"Live"` status (SM5/E10)** is set by a server Bunny webhook and is **not observable
  in-app** — flows verify Uploading/Processing + the manual refresh.
- **Force-quit upload resume (SM10)** is a known **GAP** (queues are in-memory only,
  `E2E_AUDIT.md` D-1) — the flow asserts a clean relaunch, not resume.
- Flows assert reachability + screen-unique copy; pixel/animation correctness
  (`needs-device` visual cases) stays a human check.
- `${VAR}` inside inline `env: { ... }` maps is valid Maestro syntax even though strict
  PyYAML linters flag it — Maestro's snakeyaml parser accepts it (matches every flow here).
