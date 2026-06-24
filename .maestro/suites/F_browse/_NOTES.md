# Suite F — Browse / Share & Reactions: notes & non-UI cases

Maestro YAML flows for Suite F live alongside this file. F1/F2 drive the Browse tab + in-screen
player overlay; F3–F8 drive the reaction recorder, which is reached via the **Feed doom-react path**
(tab-Feed → tap B's pending share row → RecordReaction), the same entry as smoke SM4. The actual
camera/recording and delivery legs are NEEDS-DEVICE / BLOCKED:P2 and annotated inline.

## Per-case status

| Case | File | Status | Notes |
|------|------|--------|-------|
| F1 | `F1_shorts_feed_plays_sources.yaml` | PASS-LIKELY · NEEDS-DEVICE | tab-Share → header "Browse ✵ Share" + 2-col grid; scroll + open a tile into the player. Playback (YT/TikTok/IG WebView pool + Bunny embed) is device-only. |
| F2 | `F2_share_comment_send_buttons_delivery.yaml` | PASS-LIKELY · BLOCKED:P2 | Player bottom row: chatbubbles (comments) + paper-plane (share drawer "Send to…"). Pick friend → Send button "Send to N friend(s)"; success toast "Sent to 1 friend!". Delivery (`sendThread`) is P2. |
| F3 | `F3_reaction_recorder_180s_cap_countdown.yaml` | PASS-LIKELY · NEEDS-DEVICE | Recorder via Feed share. `maxDuration={180}` → receding cap bar + a "MM:SS" countdown badge (time remaining, starts 03:00) + auto-stop at 0. Live clock → no verbatim assert. Camera device-only. |
| F4 | `F4_face_lens_478pt_mesh_live.yaml` | PASS-LIKELY · NEEDS-DEVICE | LensPicker (Mask/Warp/Overlay/Interactive) in the recorder; a Mask-tab mesh lens pulls the 478-pt MediaPipe mesh (faceTracking.ts) live over the PIP. Native plugin → physical device only. |
| F5 | `F5_anonymous_silhouette_deep_voice.yaml` | PASS-LIKELY · NEEDS-DEVICE · BLOCKED:P2 | When `users.react_anonymously` is on: picker hidden, silhouette forced, badge "🕶  Anonymous" (two spaces, verbatim); silhouette+deep-voice baked BEFORE upload. Needs the flag seeded (P2). |
| F6 | `F6_headphones_prompt.yaml` | PASS-LIKELY · NEEDS-DEVICE | On record-start with no headphones: toast "🎧 Use headphones for cleaner audio" (verbatim, 3s). Native audio-route check → device only. |
| F7 | `F7_afterthought_records_attaches.yaml` | PASS-LIKELY · NEEDS-DEVICE | After a non-queued reaction stops: overlay "Add an afterthought?" + "Send now" / "Record afterthought" (5s window). Only on the friend-share (`!queued`) path. Camera device-only. |
| F8 | `F8_intro_preroll_once_per_session_thread.yaml` | PASS-LIKELY · NEEDS-DEVICE | Thread intro pre-roll plays full-screen before the recorder, once per session per thread (introSeenStore survives `navigation.replace`). Bare video → no chrome text; verify behaviorally on device. |

## Pure-backend / no-UI cases (no YAML assertion)

_None for Suite F — every case has a reachable UI surface. F3–F8 are reaction-recorder surfaces whose
capture/native legs are NEEDS-DEVICE (annotated inline); F2/F5 delivery/flag legs are BLOCKED:P2._

## Open testID requests (TODO)

- Browse grid tiles (`share-grid-card-<id>`) and the player overlay close (✕) — F1/F2 point-tap them.
- Player action buttons `share-comments` (chatbubbles) + `share-send` (paper-plane) — F2 point-taps
  the paper-plane to open the drawer.
- Share-drawer friend rows + the bottom "Send" button — F2 selects by `@handle` text / the visible
  "Send to N friends" label.
- The reaction recorder record / stop / restart / exit controls, the lens pill, the countdown badge,
  and the afterthought "Send now" / "Record afterthought" buttons — none have testIDs; F3–F8 rely on
  visible text (where present) or describe the manual on-device step. testIDs here would make the
  recorder legs scriptable up to (but not through) the camera capture.
