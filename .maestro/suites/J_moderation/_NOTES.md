# Suite J — Moderation, safety & privacy: notes & non-UI cases

Maestro YAML flows for Suite J live alongside this file. Cases with NO Maestro-assertable UI
(server-side gates, RLS, logging behaviour) are recorded here instead of as a flow.

## Per-case status

| Case | File | Status | How it's verified |
|------|------|--------|-------------------|
| J1 | — (this file) | VERIFIED via code/edge fn · fail-open risk | See below — pre-publish gate, no direct UI. |
| J2 | `J2_report_block_hide.yaml` | PASS-LIKELY · needs-seed | Report a clip, Block its author, confirm B's content is filtered. Hide = separate swipe affordance (D8). |
| J3 | — (this file) | BLOCKED:P2 | See below — private-data RLS is server-side, not in local migrations. |
| J4 | — (this file) | VERIFIED via static/Jest | See below — logger is `__DEV__`-gated; recommend a Jest assertion. |

## Non-UI / blocked cases (no flow)

### J1 — A flagged clip is never uploaded / published
**No Maestro flow — verified via code + edge function.** The moderation check runs pre-publish
(server side), not through any user-facing screen, so there's nothing for Maestro to drive or
assert. The gate exists, but per the static audit it **FAILS OPEN on edge errors** (E2E_AUDIT
D-3): if the moderation edge function errors/times out, publishing proceeds rather than blocking.
**Verified by:** code review of the publish path + the moderation edge function; recommend a
backend/integration test that (a) confirms a clip flagged by moderation is rejected before upload,
and (b) pins the fail-open behaviour (so the risk is intentional and tracked, not silent). Note the
fail-open risk explicitly when this is signed off.

### J3 — Private data is protected by RLS (one user can't read another's private rows)
**BLOCKED:P2 — no Maestro flow.** This is a server-side Row-Level-Security guarantee. The relevant
RLS policies are NOT in the local Supabase migrations in this repo, so they can't be asserted from
the client, and Maestro (a UI driver) is the wrong tool for proving row-level access control anyway
— a passing UI doesn't prove the DB rejected a cross-tenant read.
**Verified by:** a server-side / integration test (P2) that signs in as user A and attempts to read
user B's private rows directly via the API, asserting the policy denies it. Track under P2.

### J4 — No PII in logs; the logger is a no-op in production
**No Maestro flow — verified by static inspection / Jest.** `src/.../logger.ts` is `__DEV__`-gated:
log methods are no-ops in a production (release) build. There is no UI surface to assert this from,
and log output isn't visible to Maestro.
**Verified by:** static review (confirmed `__DEV__` gating) plus a recommended **Jest unit test**:
mock `__DEV__ = false`, call the logger, and assert nothing is emitted (and, optionally, that no
PII-shaped fields are passed through in `__DEV__ = true`). Add the test alongside the existing unit
suite (e.g. next to `relativeTime.test.ts`).
