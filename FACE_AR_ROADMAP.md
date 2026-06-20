# Face‑AR Performance Roadmap

Status notes + plan for making face‑lens AR feel real‑time. Owners: **Chase (Android)**, **Manny (iOS)**.

---

## What we measured (OnePlus 10 Pro, Snapdragon 8 Gen 1 / Adreno 730)

All numbers are the `mesh · GPU · infer __ms · total __ms` badge in StudioCapture (the badge is a
temporary diagnostic — see "Cleanup" below).

| Change | Result | Takeaway |
|---|---|---|
| Original (mesh on **every** lens, 30fps feed) | dots trail face ~1s | Frame backlog: feeding 30fps into a ~40ms model. |
| Re‑render isolation (`useSyncExternalStore`, `LiveFaceLens`) | host stops re‑rendering per frame | Was re‑rendering the whole StudioCapture/Recorder tree 30×/s. |
| Throttle mesh to 12–15fps | snappy (no backlog) | The ceiling is ~1000/infer ms. |
| Drop facial‑transform matrix (unused) | 65 → 58ms | Free win, it was computed for nothing. |
| Drop blendshapes | 58 → 38‑51ms | Blendshapes cost ~10‑20ms (only ~9/70 lenses use them). |
| **Input 720p → 480p** | **40‑66ms → ~40‑66ms (no change)** | **Inference is compute‑bound, NOT upload‑bound. Resolution is a dead end.** |
| Per‑lens detector routing (BlazeFace for anchor lenses) | anchor lenses ~8‑10ms target, 30fps | Most lenses don't need the mesh at all. |

**Hard conclusion:** MediaPipe FaceLandmarker (478‑pt) on this device is **~40‑50ms / ~20fps,
compute‑bound, and not reducible by input resolution.** We cannot make the *inference* 30fps here.
Therefore real‑time mesh AR requires **decoupling render from inference** (Step 2) — or a
GPU‑native engine (see "Option B").

---

## Current architecture (after this session)

- Native plugins: `faceMesh` (478‑pt FaceLandmarker) and `faceLandmarks` (BlazeFace 6‑pt). Both
  GPU→CPU delegate fallback. Both surface `delegate`/`msInfer`/`msTotal` for the badge.
- `useFaceTracking(mirror, withMesh)` routes **per lens**: mesh lenses → FaceLandmarker @15fps;
  everything else → BlazeFace @30fps. Easing/deadband adapt to the active detector.
- Landmarks delivered via an **external store** (ref + listeners). `LiveFaceLens`
  (`useSyncExternalStore`) is the only thing that re‑renders per frame — never the host screen.
- Lens render: each lens is a React/Skia component tree rebuilt at the inference rate.

---

## Option A — keep MediaPipe, make 20fps feel real‑time (Steps 2‑4)

### Step 2 — decouple render from inference (IN PROGRESS)
Render the overlay at display rate (60fps) and **interpolate the head pose between inferences** on
the UI thread, so the lens tracks smoothly even though fresh landmarks only arrive ~20×/s.

Approach (lens‑agnostic): track current + previous head pose (eye‑mid center, roll, faceW) as
Reanimated shared values; a `useFrameCallback` computes an interpolated/lightly‑extrapolated pose
each display frame; wrap the lens `<Comp>` in a Skia `<Group transform={delta}>` that maps the
pose the lens was *rendered* at → the interpolated current pose. The lens content is a per‑inference
"picture"; the parent transform rides it on the head at 60fps with **zero extra React renders**.

- Covers all rigid/anchored art (glasses, masks, the scuba dive mask) and Step 4's model‑mapping.
- Per‑vertex surface deformation (face paint flowing with skin, the raw dot cloud) is approximated
  as rigid motion between inferences — good for head translate/rotate/scale, not for fast expression
  change. Acceptable; per‑vertex interpolation is a later refinement.
- Tuning risk: extrapolation overshoot / snap when a new inference lands. Mitigate with clamping +
  mostly interpolation (a little latency) rather than aggressive prediction.

### Step 3 — GPU‑mesh rendering + per‑lens budget
Render conforming effects as **one** Skia `Vertices`/shader draw posed by the face, not 50 animated
components. Add a render budget so a lens physically can't blur‑storm the GPU (scuba locked the UI
thread with two blur‑40 GlowOrbs + ~50 particles *on top of* mesh inference → GPU contention, mesh
spiked to 80ms). Concretely: cap particle counts, cap blur radius, and/or skip the overlay when a
frame blows the budget.

### Step 4 — rigid model‑mapping via anchors / transform
Glasses, masks, helmets, 3D props don't need the 478‑pt mesh — pose them with the 6 anchor points
(or the facial‑transform matrix, which we'd re‑enable only for these). BlazeFace‑fast, trivially
interpolated by Step 2's transform.

---

## Option B — ARCore Augmented Faces (Android) + ARKit (iOS) — SPIKE TO EVALUATE

Why it's worth a look: we've now *proven* the MediaPipe‑on‑CPU‑frame pipeline is ~20fps‑bound on
flagship Android because the model runs on a CPU‑delivered image. **ARCore Augmented Faces** runs a
468‑vertex face mesh **inside ARCore's GPU camera session** — the frame never leaves the GPU — and
it's purpose‑built for mapping textures/3D models onto faces. Plausibly true 30fps mesh natively.
Free. Splits cleanly along ownership: **Chase = ARCore, Manny = ARKit Face Tracking.**

What changes (Android):
- Camera: ARCore `Session` w/ `AugmentedFaceMode.MESH3D` instead of the VisionCamera frame‑processor
  path. This is the big one — ARCore wants to own the camera/GL surface, so it must coexist with (or
  replace) the VisionCamera capture used for recording. **Recording integration is the main risk.**
- Mesh format: ARCore gives a 468‑vertex mesh + region poses (nose tip, forehead L/R) + a center
  pose matrix — different indices/coordinate space than MediaPipe; the lens layer's `faceFrame`
  mapping + any mesh‑index lenses need an adapter.
- Rendering: ARCore is GL‑native; pairs naturally with an OpenGL/Filament overlay. Bridging to the
  existing Skia lens renderer needs a shared GL context or a switch to GL‑based lens rendering.

Spike plan (1‑2 days, throwaway):
1. Bare ARCore Augmented Faces sample on the OnePlus → confirm sustained **mesh fps** (the whole
   question). If it's ~30fps, the migration is justified.
2. Prototype recording a clip while Augmented Faces runs (the integration risk).
3. Map one existing lens (e.g. a simple anchored prop) onto the ARCore mesh to size the lens‑layer
   adapter.
Decision gate: only commit to migration if (1) clears 30fps AND (2) recording coexists.

Cost of Option B: two native integrations (ARCore + ARKit), a lens‑layer rewrite to their mesh
format, and recording re‑plumbing. Big, but it's the only path to *true* 60fps GPU mesh if Step 2's
interpolated 20fps isn't enough.

**Recommendation:** do Step 2 now (library‑agnostic; likely sufficient), run the Option B spike in
parallel, and only migrate if the spike proves a real 30fps win AND interpolation falls short.

---

## Cleanup (remove before release)
- Temp on‑screen badge in `StudioCaptureScreen` (`delegateBadge`, `trackKind`, `meshPerf`).
- Temp `msInfer`/`msTotal` timing in `FaceMeshFrameProcessor.kt` + `FaceLandmarksFrameProcessor.kt`
  (keep `delegate` if useful; the ms fields are profiling‑only).
- Decide blendshapes policy: make them conditional (only the ~9 lenses that read jaw/blink/smile),
  or accept the ~10‑20ms on the mesh path.
