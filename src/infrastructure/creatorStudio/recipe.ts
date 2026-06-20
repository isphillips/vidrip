// Studio export "recipe" — the single, forward-compatible contract handed to the
// native exporter (iOS AVFoundation now, Android Media3 later). Editing is
// non-destructive: the UI mutates a recipe, and native bakes it to one MP4 on
// export. Slice 1 implements clips[0] trim only; filter/overlays are part of the
// shape but ignored natively until later slices.

/** Hard cap on a published studio video. Enforced at capture, import, and export. */
export const MAX_STUDIO_MS = 180_000; // 3 minutes

export type StudioClip = {
  uri: string;
  /** Trim window into the source, in ms. Omit start → 0; omit end → clip end. */
  trimStartMs?: number;
  trimEndMs?: number;
};

export type StudioFilter = {
  /** Catalog id, e.g. 'warm' | 'mono' | 'film' | 'vivid'. */
  id: string;
  /** 0..1, defaults to 1. */
  intensity?: number;
};

export type StudioOverlay =
  | { type: 'text'; text: string; x: number; y: number; scale: number; rotation: number; color?: string }
  | { type: 'sticker'; uri: string; x: number; y: number; scale: number; rotation: number };

/** Parametric color adjustments, baked on export (CIColorControls/exposure/hue). */
export type StudioAdjust = {
  brightness?: number;  // -1..1   (0 = none)
  contrast?: number;    //  0..2   (1 = none)
  saturation?: number;  //  0..2   (1 = none)
  exposure?: number;    // -2..2   (0 = none, EV)
  hue?: number;         // -PI..PI (0 = none, radians)
};

export type StudioRecipe = {
  /** Ordered clips, concatenated on export. Slice 1 reads only clips[0]. */
  clips: StudioClip[];
  /** Composed look (preset ∘ adjust) as a 4×5 RGBA color matrix (20 numbers). Baked
   *  natively via CIColorMatrix — identical to the Skia preview's <ColorMatrix>. */
  colorMatrix?: number[] | null;
  /** Horizontal flip. */
  mirror?: boolean;
  /** Pre-rendered overlay layer (transparent PNG, captured at preview size) composited
   *  over every frame on export. width/height are the capture's point size. Used when the
   *  overlay is static (text / image stickers only). */
  overlay?: { uri: string; width: number; height: number } | null;
  /** Animated overlay baked as a captured frame loop. When present, native composites the
   *  time-matched frame onto each output frame and crossfades the last `overlap` frames back
   *  into the first for a seamless repeat. Takes precedence over `overlay`. */
  overlayFrames?: { uris: string[]; fps: number; overlap: number; width: number; height: number } | null;
  /** Audio voice modulation baked on export. 'deep' pitch-shifts the voice down (preserving timing)
   *  for the "React Anonymously" mode — iOS via AVAudioUnitTimePitch, Android via SonicAudioProcessor.
   *  Omit/null = original audio copied through unchanged. */
  voiceMod?: 'deep' | null;
  /** Anonymous-mode silhouette drawn NATIVELY per output frame from a captured mesh track (instead of
   *  pre-rendered overlay PNGs — no JS frame capture, no jank). `trackFile` is a file:// path to JSON:
   *  { fps, frameAspect, meshIdx, frames:[[le,re,nose,mouth flat + faceWidth]|null], meshFrames }. */
  silhouette?: { trackFile: string } | null;
  output?: { width?: number; height?: number; fps?: number; bitrate?: number };
};

/** Effective duration of a single clip given its (optional) trim window. */
function clipDurationMs(clip: StudioClip, sourceDurationMs?: number): number {
  const start = Math.max(0, clip.trimStartMs ?? 0);
  const end = clip.trimEndMs ?? sourceDurationMs ?? start;
  return Math.max(0, end - start);
}

/** Summed output duration across all clips, in ms. */
export function recipeDurationMs(recipe: StudioRecipe, sourceDurationMs?: number): number {
  return recipe.clips.reduce((sum, c) => sum + clipDurationMs(c, sourceDurationMs), 0);
}

/**
 * Throws if the recipe is malformed or would produce an over-length video.
 * Belt-and-suspenders backstop so a bad recipe can never bake a >3min file.
 */
export function assertRecipeValid(recipe: StudioRecipe, sourceDurationMs?: number): void {
  if (!recipe.clips?.length) {
    throw new Error('Recipe has no clips.');
  }
  for (const c of recipe.clips) {
    if (!c.uri) { throw new Error('A clip is missing its source uri.'); }
    if (c.trimStartMs != null && c.trimEndMs != null && c.trimEndMs <= c.trimStartMs) {
      throw new Error('A clip has an empty trim window.');
    }
  }
  const total = recipeDurationMs(recipe, sourceDurationMs);
  if (total > MAX_STUDIO_MS) {
    throw new Error(`Video is ${Math.round(total / 1000)}s — the limit is ${MAX_STUDIO_MS / 1000}s.`);
  }
}
