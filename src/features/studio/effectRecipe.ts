import type { TextAnim } from './components/EffectText';
import type { FaceLensTrack } from '../lens/faceLens';

// ─── Overlay recipe ───────────────────────────────────────────────────────────
// The serializable description of a video's overlay layer. Stored with the post and
// replayed live over the player (no pixels baked unless the user shares out).

export type OverlayNode =
  | {
      kind: 'text';
      nx: number; ny: number; scale: number; rotation: number; // nx/ny: center, 0..1 of canvas
      text: string; color?: string; font?: string; fontSize?: number; bold?: boolean; italic?: boolean; anim?: TextAnim;
    }
  | {
      kind: 'sticker';
      nx: number; ny: number; scale: number; rotation: number;
      stickerKey: string;
    };

// ─── Music / audio ──────────────────────────────────────────────────────────────
// One music track laid over the video. Modeled as a LIST on StudioAudio so multi-track mixing is a
// later config change, not a re-architecture (V1 uses exactly one). `mode` records how it was added:
//   'pre'  — played aloud while recording (mic off) → it IS the video's audio.
//   'post' — background music added later → mixed with (or replacing) the recorded audio.
// `uri` is a local file path by export time (see resolveTrackFile in music/library).
export type AudioTrack = { id: string; uri: string; title: string; volume: number /* 0..1 */; mode: 'pre' | 'post' };
export type StudioAudio = {
  tracks: AudioTrack[];
  keepOriginal: boolean;       // post: mix the music UNDER the recorded audio (false = replace it)
  originalVolume: number;      // 0..1, applied to the recorded audio when keepOriginal
};

export type OverlayRecipe = {
  version: 1;
  canvasW: number;            // authoring box size (points) — for proportional scaling
  canvasH: number;
  nodes: OverlayNode[];
  fullscreen?: string | null; // full-screen effect sticker key (fills the frame)
  // AR face-lens track captured during recording (per-frame landmarks). Present on a recorded
  // reaction/clip whose reactor wore a lens — replayed over the selfie video (not the source),
  // consistent with the rest of the replay model. Reused on channel_posts.overlay_recipe (which
  // is otherwise unused for reaction clips) so no extra column/migration is needed.
  faceLens?: FaceLensTrack | null;
  // Music laid over the video (baked into the export). Null/absent = no music.
  audio?: StudioAudio | null;
};

/** True when there's nothing to bake/replay (so playback can skip the effect layer entirely). */
export function isEmptyRecipe(r?: OverlayRecipe | null): boolean {
  return !r || (!r.fullscreen && r.nodes.length === 0
    && (!r.faceLens || r.faceLens.frames.length === 0)
    && (!r.audio || r.audio.tracks.length === 0));
}

/** Wrap a captured face-lens track as a standalone recipe (no creator overlay nodes). */
export function faceLensRecipe(track: FaceLensTrack): OverlayRecipe {
  return { version: 1, canvasW: 9, canvasH: 16, nodes: [], fullscreen: null, faceLens: track };
}
