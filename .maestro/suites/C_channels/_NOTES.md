# Suite C — Channels: notes & non-UI cases

Maestro YAML flows for Suite C live alongside this file. Cases that have NO UI surface to
drive (pure backend / RLS / data-layer) are recorded here instead of as a flow.

## Per-case status

| Case | File | Status | Notes |
|------|------|--------|-------|
| C1 | `C1_list_public_membersonly_exclude_dm.yaml` | PASS-LIKELY · needs-seed | Asserts `${SEED_CHANNEL_NAME}` is listed. DM/private chats are sourced from the Messages tab and must not appear here; no per-card testID to assert absence directly. |
| C2 | `C2_card_video_count_intro_no_stamp.yaml` | GAP · needs-seed | Card shows `{N} video(s)` + `Intro`. Documented gap: card has **no last-updated stamp** (E2E_AUDIT C2/D-7). |
| C3 | `C3_intro_fullscreen_autoplay_tap_close.yaml` | PASS-LIKELY · needs-seed | Tap `Intro` → full-screen autoplay modal → tap to close. |
| C4 | `C4_join_subscribe_invite_locked.yaml` | PASS-LIKELY (join) · BLOCKED:P2 (subscribe) | Join automated on a public channel. Subscribe = web checkout (no in-app buy); invite/locked annotated. |
| C5 | `C5_react_to_channel_post_count_increments.yaml` | PASS-LIKELY · NEEDS-DEVICE · needs-seed | Reach `Record Your Reaction`; record/save needs a real camera. |
| C6 | `C6_leave_review_after_reacting_count_updates.yaml` | PASS-LIKELY · NEEDS-DEVICE · needs-seed | Reviews pill reachable; `★ Leave a Review` requires prior reaction; record needs a camera. |
| C7 | `C7_floating_record_buttons_absent_on_public.yaml` | GAP / expectation mismatch · needs-seed | Floating mic+video record buttons render **only in private DM chats**, not on public/members-only channels (E2E_AUDIT C7/D-2). Flow documents their expected absence. |
| C8 | `C8_membersonly_playback_joined_vs_gated.yaml` | PASS-LIKELY (gated leg) · BLOCKED:P2 · needs-seed | Non-member sees `Subscribers only`. Joined-subscriber playback needs web-checkout entitlement (can't set on-device). |

## Pure-backend / no-UI cases (no YAML)

_None for Suite C — every case has a reachable UI surface (the blocked legs are annotated inline
in their flows). The C7 "populated DM recorder" state is intentionally out of scope here: those
buttons belong to the private-DM chat surface (Messages), not the Channels suite._

## Open testID requests (TODO)

- `channel-card-<id>` on `ChannelCard` — would let C1 assert DM rows are absent and select a
  specific card deterministically.
- testIDs on the public channel grid post tiles — C5/C6 currently select obscured posts via the
  `React to reveal` caption / visible title.
- `channel-record-video` / `channel-record-mic` on the floating record buttons — C7 could then
  assert their absence via `assertNotVisible` by id instead of documenting the gap.
