import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Canvas, Path, Circle, Group, BlurMask, Rect, ColorMatrix, Image as SkImage, Skia,
} from '@shopify/react-native-skia';

// ─── Skia GPU pipeline pre-warm ────────────────────────────────────────────────
//
// On Android, Skia compiles (and then caches) a GPU pipeline the FIRST time it executes a given
// draw op — a stroked path, a circle with a blur mask, an image with a colour-matrix filter. That
// first compile is a one-off stutter, which is exactly the "lag when I tap a filter/effect the first
// time" report. iOS/Metal compiles fast enough that it's invisible there.
//
// This component mounts an offscreen (1px, fully transparent) canvas at studio entry and draws each
// pipeline the editor will later need, ONCE. That forces the compile + cache up front — on a screen
// where a brief hitch doesn't matter — so the first real filter/effect tap is already warm. The
// pipeline cache is per Skia/GPU context and shared across the app, so warming here persists into
// the editor screens. We unmount after a short delay to release the surface; the cache survives.

// Built once in JS (not a worklet) — a short diagonal line to warm the stroked-path pipeline.
const WARM_PATH = (() => {
  const p = Skia.Path.Make();
  p.moveTo(0, 0);
  p.lineTo(8, 8);
  return p;
})();

// A 1×1 transparent PNG, decoded to an SkImage so we warm the image-sampling + colour-matrix
// pipeline that the video preview and the filter swatches use. Guarded — null if decode fails.
const WARM_IMG = (() => {
  try {
    const data = Skia.Data.fromBase64(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    );
    return Skia.Image.MakeImageFromEncoded(data);
  } catch {
    return null;
  }
})();

const IDENTITY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

export default function EffectWarmup() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    // Long enough for the offscreen canvas to draw at least once and compile the pipelines.
    const t = setTimeout(() => setOn(false), 2500);
    return () => clearTimeout(t);
  }, []);
  if (!on) { return null; }

  return (
    <View style={styles.hidden} pointerEvents="none" collapsable={false}>
      <Canvas style={styles.canvas}>
        {/* Stroked path → rain / splash layers */}
        <Path path={WARM_PATH} color="#fff" style="stroke" strokeWidth={2} strokeCap="round" />
        {/* Circle + solid blur mask → ember glow */}
        <Group>
          <BlurMask blur={4} style="solid" />
          <Circle cx={4} cy={4} r={3} color="#FF4500" />
        </Group>
        {/* Circle + normal blur mask → smoke */}
        <Group>
          <BlurMask blur={14} style="normal" />
          <Circle cx={4} cy={4} r={3} color="rgb(64,60,58)" />
        </Group>
        {/* Colour matrix on a fill → the adjust/look pipeline */}
        <Rect x={0} y={0} width={8} height={8} color="#888">
          <ColorMatrix matrix={IDENTITY} />
        </Rect>
        {/* Colour matrix on an image → video preview + filter swatches */}
        {WARM_IMG && (
          <SkImage image={WARM_IMG} x={0} y={0} width={8} height={8} fit="cover">
            <ColorMatrix matrix={IDENTITY} />
          </SkImage>
        )}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', left: -9999, top: -9999, width: 1, height: 1, opacity: 0 },
  canvas: { width: 8, height: 8 },
});
