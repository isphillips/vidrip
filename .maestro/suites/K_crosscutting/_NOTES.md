# Suite K — Cross-cutting concerns: notes & non-UI cases

Maestro YAML flows for Suite K live alongside this file. Cases that are pure runtime/visual/
network behaviour (and the documented GAPs) are recorded here instead of as a flow.

## Per-case status

| Case | File | Status | How it's verified |
|------|------|--------|-------------------|
| K1 | — (this file) | GAP · NEEDS-DEVICE (airplane mode) | See below — no NetInfo/retry; in-memory queue (E2E_AUDIT D-1). |
| K2 | — (this file) | GAP · NEEDS-DEVICE | See below — concurrent uploads, indeterminate progress, no retry (E2E_AUDIT D-1). |
| K3 | — (this file) | NEEDS-DEVICE (visual) | See below — notch / Dynamic Island / bottom-inset layout. |
| K4 | — (this file) | NEEDS-DEVICE (profiling) | See below — runtime jank/performance. |
| K5 | `K5_back_gesture_nav_hides_studio.yaml` | PARTIAL · NEEDS-DEVICE | Automates: nav hides on Studio sub-screen + Android hardware Back pops back. iOS edge-swipe verified by hand. |
| K6 | — (this file) | COVERED by Jest | See below — timestamp localization is pure logic (`relativeTime.test.ts`). |

## Non-UI / blocked / GAP cases (no flow)

### K1 — Offline: graceful errors & retries; the action queue survives backgrounding
**GAP — no Maestro flow (documents the gap + manual steps).** Per the static audit (E2E_AUDIT D-1)
the app has **no NetInfo connectivity awareness, no automatic retry, and an in-memory action
queue** that does NOT survive a process kill. So there is no graceful-offline UI to assert, and the
"queue survives background/kill" guarantee the case asks for isn't met today.
**Verified by:** manual device testing — enable airplane mode, perform an action (send / react /
publish), confirm the error handling/UX, then background or force-quit the app and reconnect to see
whether the queued action survives and completes. Expect gaps; file follow-ups against D-1. (Not
Maestro-automatable: Maestro can't reliably toggle the OS network state or kill+restore mid-queue.)

### K2 — Upload queue: order preserved, progress shown, failed items retried
**GAP — no Maestro flow.** Per E2E_AUDIT D-1 uploads run **concurrently (no enforced ordering)**,
progress is an **indeterminate spinner (no real percentage)**, and there is **no retry** on
failure. The behaviour the case specifies (ordered queue + determinate progress + retry) isn't
implemented, so there's nothing to assert.
**Verified by:** manual device testing of multi-upload behaviour; track the missing
ordering/progress/retry against D-1. Not Maestro-automatable (needs real uploads, network
manipulation, and frame-level progress observation).

### K3 — Safe-area: notch / Dynamic Island + home-indicator / bottom inset respected
**NEEDS-DEVICE (visual) — no Maestro flow.** This is a pixel-level layout concern (content clears
the notch / Dynamic Island and the bottom home indicator across device classes). Maestro asserts
element presence, not layout/insets, so it can't catch clipping or overlap.
**Verified by:** manual visual pass on a device matrix — at minimum an iPhone with Dynamic Island,
an older notch iPhone, a no-notch device, and an Android with a display cutout — checking headers,
the bottom tab bar, and full-screen players/recorders.

### K4 — Performance: scrolling and transitions are smooth (no jank)
**NEEDS-DEVICE (profiling) — no Maestro flow.** Frame rate / jank is a runtime characteristic
Maestro doesn't measure.
**Verified by:** manual profiling on a real device (e.g. the RN/Flipper performance monitor or
platform profilers) — scroll the Feed/Channels lists and run screen transitions, watching for
dropped frames; spot-check on a low-end Android.

### K6 — Timestamps are localized / relative-formatted correctly
**COVERED by Jest — no Maestro flow needed.** Timestamp formatting is pure logic with no meaningful
UI branch to drive, and it's already unit-tested in `relativeTime.test.ts`.
**Verified by:** the existing Jest unit suite (`relativeTime.test.ts`). Extend that test for any new
locale/relative-format cases rather than adding a Maestro flow.
