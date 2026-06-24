# Suite H — Exclusive: notes & non-UI cases

Maestro YAML flows for Suite H live alongside this file. Cases (or legs of cases) that have NO UI
surface to drive (pure backend / RLS) are recorded here instead of as a flow.

## Per-case status

| Case | File | Status | Notes |
|------|------|--------|-------|
| H1 | `H1_exclusive_rail_shows_gifts_collections.yaml` | PASS-LIKELY · needs-seed | Feed rail headed `Exclusive Content`; seeded `${SEED_EXCLUSIVE_COLLECTION}` tile present. Rail renders nothing without an award (or DEMO_MODE). |
| H2 | `H2_gift_reveal_grants_access.yaml` | PASS-LIKELY · needs-seed | Tap unopened gift → `Tap to open` → reveal → `View collection` CTA → granted collection opens. Needs a fresh, unopened award. |
| H3 | `H3_exclusive_watch_granted_vs_gated.yaml` | PASS-LIKELY (granted) · BLOCKED:P2 (ungranted) · needs-seed | Granted video plays from the rail. Ungranted gating is RLS-only (see below). |

## Pure-backend / no-UI cases (no YAML assertion)

### H3 — ungranted exclusive video is gated (RLS)
There is **no client path** to a video account A wasn't awarded: ungranted collections are filtered
out of A's rail by RLS (`fetchMyAwardedCollections`), so an ungranted collection/video never becomes
navigable in the UI. The "access denied / gated" state therefore can't be reached on-device and has
no screen to assert.

- **Verify at the data layer instead.** With a second collection NOT awarded to A, confirm via
  API/SQL that A's `fetchAwardedCollection` / `fetchExclusiveCollectionVideos` / the `ExclusiveWatch`
  fetch returns empty or 403 (RLS denies). Granted A returns the rows; ungranted A does not.
- **Why P2:** requires a server-side fixture (a second, unawarded collection) and a data-layer probe
  outside Maestro. Unblock by adding that probe to the backend test harness.

## Open testID requests (TODO)

- testIDs on `ExclusiveRail` tiles (gift + collection) — H1/H2 currently select by collection name.
- testIDs on `ExclusiveCollectionScreen` video cells — H3 selects a ready tile by its title.
- a testID on the `GiftRevealScreen` gift `Pressable` — H2 taps the box by point coordinates.
