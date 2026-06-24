# Suite I — Notifications & deep links: notes & non-UI cases

Maestro YAML flows for Suite I live alongside this file. Cases with NO Maestro-assertable UI
(OS-owned dialogs, real pushes, native routing, or features that don't exist) are recorded here.

## Per-case status

| Case | File | Status | How it's verified |
|------|------|--------|-------------------|
| I1 | `I1_notification_permission_prompt.yaml` | PASS-LIKELY · NEEDS-DEVICE | Thin flow reaches signed-in state; the OS permission dialog (Android 13+ POST_NOTIFICATIONS / iOS authorization alert) is system-owned and verified by eye on a device. |
| I2 | — (this file) | BLOCKED:P4 | See below — copy lives in a server-side DB trigger, not in the repo. |
| I3 | — (this file) | NEEDS-DEVICE (manual) | See below — needs a real push to test tap→deep-link routing. |
| I4 | — (this file) | NOT IMPLEMENTED · P5 moot | See below — universal links don't exist; invites are plain-text codes. |
| I5 | `I5_oauth_deeplink_return_session.yaml` | BLOCKED:P1 | Thin flow reaches Account (where the `reaxn://oauth…` callback is consumed); live provider round-trip is P1. |

## Non-UI / blocked cases (no flow)

### I2 — Notification copy is correct in foreground / background / killed states
**BLOCKED:P4 — no Maestro flow.** The notification title/body copy is produced server-side by a
database trigger / push pipeline that is NOT present in this repo, so there is no in-app text to
assert and no way to drive the three delivery states (fg / bg / killed) from Maestro. The
fg/bg/killed presentation difference is also OS-owned (notification tray vs in-app banner).
**Verified by:** manual device testing once the push payloads are available (P4) — send a real
push in each app state and read the tray/banner copy by eye.

### I3 — Tapping a notification deep-links to the right screen
**NEEDS-DEVICE (manual) — no Maestro flow.** Requires a real delivered push to tap; Maestro can't
originate a system notification, and tapping it is an OS-tray interaction outside the app's view
hierarchy. The in-app **routing** that a tapped push triggers DOES exist and is exercisable via
`openLink` in unit/other flows. Routes handled in `src/app/navigation/RootNavigator.tsx`
(`handleDeepLink`, all under the `reaxn://` scheme — the only scheme registered, see
`android/app/src/main/AndroidManifest.xml`):
- `reaxn://share?text=<…>`            → stashes a pending URL → Share (Browse) tab
- `reaxn://reaction/<id>`             → opens that reaction (WatchReaction)
- `reaxn://channel/<id>?subscribed=1` → opens that channel (post-subscribe return)
- `reaxn://oauth?code=…&state=…`      → AccountScreen runs the OAuth account-sync
- magic-link hash with `access_token` + `refresh_token` → `supabase.auth.setSession`
**Verified by:** manual device steps — trigger a real push for each notification type, tap it from
the tray in fg/bg/killed, and confirm it lands on the matching screen above. (Routing alone can be
smoke-checked with `- openLink: "reaxn://reaction/<seededId>"` on a device.)

### I4 — Invite universal link `/i/<code>` opens the app / store
**NOT IMPLEMENTED — no Maestro flow; feature absent.** There is no Universal Link / App Link setup:
no AASA file, no `applinks:` / `android:autoVerify` intent filter — only the custom `reaxn://`
scheme is registered. Invites are plain-text codes entered manually
(`src/features/.../InviteManagementScreen.tsx`; see E2E_AUDIT D-9 / I4). There is no `/i/<code>`
URL to open and nothing to assert. **P5 is moot until the feature is built.**
**Verified by:** N/A (does not exist). Re-evaluate if/when universal-link invites are implemented.
