import type { LensProps } from '../core';

// Placeholder overlay for camera-warp lenses (bighead/tinyface/swirl). The warp is a live shader on
// the preview and isn't baked into recordings yet, so on replay there's nothing to draw — this
// renders nothing. (Mega Eyes is the exception: it has a real overlay, BigEyes, for replay.)
export function WarpGhost(_: LensProps) {
  return null;
}
