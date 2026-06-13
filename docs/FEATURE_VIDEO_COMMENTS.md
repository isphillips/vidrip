# Feature plan — Public video-comments on browse videos (nested "video threads")

> Status: DESIGN ONLY (no code yet). Captured 2026-06-11.

## Concept
On the **Browse** tab, a browse video becomes the root of a **tree of short video-comments**.
Each node is a user-recorded video. Navigation maps onto the tree:
- **Swipe left/right = siblings** (same parent)
- **Swipe down = descend** into the focused item's direct video-comments (children)
- **Swipe up = ascend** to the parent's row (inverse of down — assumed, needed for back-nav)

Depth 0 = the browse feed (siblings are the shorts). Depth 1 = a short's direct comments.
Depth 2 = replies to a comment. Unbounded depth.

Every node supports: **emoji reactions**, **recording a video-comment reply**, and (at any
node) **share with a friend** (existing).

## Decisions (locked)
- **Visibility: PUBLIC.** Comments on a public video are public to everyone. This is a
  **standalone system, separate from channels/chats** (different table, different RLS,
  public storage). Implies **mandatory moderation** before publish.
- **Sibling ordering: friends → most-reacted → most-recent** (personalized/tiered).
- **Depth 0 = tap-to-play.** Swipe to move between shorts; tap to start the embed (YouTube/
  TikTok can't reliably programmatically autoplay, esp. YouTube on Android). Depth ≥1 are
  our own mp4s and autoplay via react-native-video.

## Reuse (most of the groundwork exists)
- `channel_posts.parent_post_id` already models a 1-level reaction tree → generalize to N.
- **WatchChannelClipScreen** already does source-in-PiP + sibling reactions + auto-advance
  (≈ one "row" of this nav).
- **ReactionRecorder** records a front-camera video while a source plays (youtube/tiktok/
  instagram, or a file via `sourceUri`) → commit + background upload. Replying to a comment
  = recording against another comment's mp4 (reuse the `sourceUri` path).
- **Emoji reactions + realtime** (`channel_post_emoji_reactions` pattern).
- **Moderation** (`assertVideoAllowed`), the commit→relay upload pattern, gesture-handler +
  reanimated.

## Data model (new, public)
`video_comments`
- `id`, `root_source_id` (external short id), `source_type` (youtube/tiktok/instagram)
- `parent_comment_id` (null = direct comment on the short)
- `author_id`, `video_url`, `duration`, `storage_mode`, `created_at`
- denormalized `reply_count`, `emoji_count` (trigger-maintained, for sorting/affordances)

`video_comment_emoji_reactions` (`comment_id`, `user_id`, `emoji`)

- **RLS:** public read; insert by authenticated users (post-moderation); author can delete.
- **Storage:** a PUBLIC comment-videos bucket (distinct from the private `reactions` bucket).
- **Ordering RPC:** because "friends-first" is per-viewer, ordering can't be a global sort.
  Use a server RPC `get_video_comments(root_source_id, parent_comment_id, viewer_id, cursor)`
  that returns a tiered-sorted, paginated page: friends' comments first, then by `emoji_count`,
  then `created_at`. Needs the friend graph (reuse the existing friends system) and the
  denormalized counts.

## Navigation engine (the hard, novel part — main risk)
Off-the-shelf pagers don't handle **dynamic depth**. Plan a **custom Reanimated 2-axis layer**:
- State = a **path stack**: `[{ siblings, index, cursor } per level]`. Visible node = deepest
  level's current item.
- One pan gesture resolves horizontal (change index) vs vertical (change depth) with spring
  transitions; cache visited levels for instant back-nav.
- **Only the focused video plays;** preload immediate neighbors (prev/next sibling + first
  child) for smooth swipes.
- **Recommendation: prototype the nav shell in isolation first** (placeholder cards, no real
  video) to nail the gesture feel before wiring data/playback.

## Risks / constraints
1. Depth-0 embeds = tap-to-play (decided). Don't fight YouTube autoplay.
2. Public video = **moderation mandatory** (reuse `assertVideoAllowed`, gate before insert).
3. **Scale/perf:** never load the whole tree; per-level lazy load + pagination + level cache.
4. **Don't-get-lost UX:** affordances for "⤓ N comments / be the first", "swipe up to go
   back", and a depth/breadcrumb hint.
5. Legal: source short still plays live via embed; comments are users' own recordings (no
   change to the no-capture rule).

## Phasing (ship in slices)
- **P1 — Backend + creation:** tables, RLS, public bucket, moderation, record-a-comment
  (reuse ReactionRecorder), emoji reactions, the ordering RPC.
- **P2 — Simple UI:** on a browse video, a comments view (even a vertical list/sheet) +
  emoji + reply. Proves data + recording end-to-end with no fancy nav.
- **P3 — 2D swipe nav:** the custom gesture engine; start 1–2 levels, then unbounded depth.
- **P4 — Polish:** preloading, counts, "someone replied to your comment" notifications,
  deep-link to a comment (ties into the share feature).

## Still-open questions (decide before/within P1–P3)
- **Max depth?** Unbounded is fine in data; consider a soft UI cap / "continue thread" jump.
- **Who can comment** — any authenticated user, or gated (e.g. must have an account in good
  standing)?
- **Notifications** on replies to your comment / emojis? (Reuse the push system.)
- **Moderation specifics** — auto (the existing check) only, or + reporting/blocking + human
  review queue for public content?
- **Deep-linking** a specific comment (e.g. `reaxn://comment/<id>`) — fold into the existing
  share/deeplink infra.
- **Depth-0 reconsideration** — is the swipeable feed the public shorts, or should depth 0 be
  framed differently given tap-to-play? Worth a design spike in P3.
- **Counts at scale** — confirm trigger-maintained `emoji_count`/`reply_count` vs on-read.
