import type { TextAnim } from './components/EffectText';

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

export type OverlayRecipe = {
  version: 1;
  canvasW: number;            // authoring box size (points) — for proportional scaling
  canvasH: number;
  nodes: OverlayNode[];
  fullscreen?: string | null; // full-screen effect sticker key (fills the frame)
};

/** True when there's nothing to replay (so playback can skip the effect layer entirely). */
export function isEmptyRecipe(r?: OverlayRecipe | null): boolean {
  return !r || (!r.fullscreen && r.nodes.length === 0);
}
