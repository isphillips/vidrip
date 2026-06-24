# Suite E — Studio: notes & non-UI cases

Maestro YAML flows for Suite E live alongside this file. Every case here has a reachable UI surface;
the camera/recording legs are NEEDS-DEVICE and the delivery/encode legs are BLOCKED:P2 — both are
annotated inline in each flow. No pure-backend-only (notes-only) cases for this suite.

## Per-case status

| Case | File | Status | Notes |
|------|------|--------|-------|
| E1 | `E1_studio_tab_fab_no_top_x.yaml` | PASS-LIKELY | tab-Studio → StudioHome shows "Studio" + "New video" with the bottom nav present (no top X). Tapping "New video" → Capture hides the bottom nav (assertNotVisible `tab-Feed`); Capture has its own top X. |
| E2 | `E2_capture_trim_180s_clamp.yaml` | PASS-LIKELY · NEEDS-DEVICE | Reachable to "New video". Capture is camera-only; Trim seeds [0, min(dur,180000)] and clamps the window to 180s, showing "Max length is 180s." (verbatim, trailing period). |
| E3 | `E3_filter_adjust_params_presets.yaml` | PASS-LIKELY · NEEDS-DEVICE | Looks screen (header "Looks"). "Adjust" panel = 5 sliders: Exposure / Brightness / Contrast / Saturation / Hue (+ Reset/Done). Preset swatch strip + "All" category pill. Needs footage. |
| E4 | `E4_lens_grid_4col_tabs.yaml` | PASS-LIKELY · NEEDS-DEVICE | LensPicker lives on Capture. 4-col edge-to-edge grid; tabs **Mask / Warp / Overlay / Interactive** (spec said "Mesh"; shipped label is "Mask"). First tile always "None". |
| E5 | `E5_overlay_stickers_composite.yaml` | PASS-LIKELY · NEEDS-DEVICE | Overlays screen (header "Overlays"). Tab bar: Text / Stickers / Emoji / Animated / **Effects** (spec said "overlays"; shipped label is "Effects"). "Next" bakes → "Processing video". |
| E6 | `E6_publish_fork_friends_vs_channel.yaml` | PASS-LIKELY · NEEDS-DEVICE · BLOCKED:P2 | Details (header "New video"). Creator-only "Post to" toggle **Friends** vs **Channel** (Channel locks without creator_studio). Sign in as account C. Final CTA delivery is P2. |
| E7 | `E7_drafts_resume_raw_or_last_saved.yaml` | PASS-LIKELY · NEEDS-DEVICE | "Drafts" tab + empty-state copy assertable. Resume Alert: "Resume draft" → "Raw footage" / "Last saved". **Gap (D-6):** resuming an audio-stage draft falls through to Trim, not Music. |
| E8 | `E8_scheduled_hidden_until_release.yaml` | PASS-LIKELY · BLOCKED:P2 | "Scheduled" tab loads + empty-state assertable. Held-until-release + auto-publish needs the release backend + a seeded future-dated post. |
| E9 | `E9_collections_exclusive_gating.yaml` | PASS-LIKELY · BLOCKED:P2 | Collections reached via the diamond (Exclusive) header icon → header "Exclusive", CTA "New collection". Award/entitlement gating is RLS-only (mirrors Suite H/H3). |
| E10 | `E10_processing_status_manual_refresh.yaml` | PASS-LIKELY · BLOCKED:P2 | "Published" tab loads + empty-state assertable. Status labels Uploading/Processing/Live/Failed + per-row refresh. "Live" flip is a server Bunny webhook (not in-app). |

## Pure-backend / no-UI cases (no YAML assertion)

_None for Suite E — every case has a reachable UI surface; the blocked/device legs are annotated
inline in their flows._

## Open testID requests (TODO)

- Capture screen close (X) button — E1 backs out by point-tap; a testID would make the
  nav-hides-on-deeper-steps assertion robust.
- `studio-collections-button` (diamond icon) + `studio-calendar-button` on the StudioHome header —
  E9 point-taps the Exclusive/Collections icon.
- A testID on draft rows in the Drafts list — E7 point-taps a row to open the resume Alert.
- testIDs on the StudioHome video-row status refresh + on the row itself — E10 point-taps the
  per-row refresh; would let status-label assertions select a specific row.
- A testID on the Trim "Next" / per-step `GradientButton` CTAs — E2/E3/E5 advance by visible "Next".
