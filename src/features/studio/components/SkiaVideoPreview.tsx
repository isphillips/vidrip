import React, { useEffect } from 'react';
import { Canvas, Image, ColorMatrix, Group, useVideo } from '@shopify/react-native-skia';
import { type CMatrix } from '../colorMatrix';

// Real-time look preview: Skia decodes the clip's frames and applies the look as a
// GPU color matrix every frame — adjustments show live on the PLAYING video. Skia
// hands us RAW (unrotated) frames, so we apply the video's rotation metadata + fit +
// mirror ourselves. The native bake uses the same matrix, so preview === export.
export default function SkiaVideoPreview({
  uri, width, height, matrix, mirror, paused, onAspect,
}: { uri: string; width: number; height: number; matrix: CMatrix; mirror: boolean; paused?: boolean; onAspect?: (a: number) => void }) {
  const { currentFrame, rotation, size } = useVideo(uri, { looping: true, paused: paused ?? false });

  const iw = size?.width || width;
  const ih = size?.height || height;
  const swapped = rotation === 90 || rotation === 270;
  const effW = swapped ? ih : iw;          // displayed dims after rotation
  const effH = swapped ? iw : ih;
  const scale = Math.min(width / effW, height / effH);   // contain

  // Report the displayed aspect once known (lets the overlay box match the frame).
  useEffect(() => { if (size?.width && size?.height && onAspect) { onAspect(effW / effH); } }, [size?.width, size?.height, rotation]); // eslint-disable-line

  // Order: center on canvas → mirror (display space) → rotate upright → fit → center the raw frame.
  const transform = [
    { translateX: width / 2 }, { translateY: height / 2 },
    { scaleX: mirror ? -1 : 1 },
    { rotate: (rotation * Math.PI) / 180 },
    { scale },
    { translateX: -iw / 2 }, { translateY: -ih / 2 },
  ];

  return (
    <Canvas style={{ width, height }}>
      <Group transform={transform}>
        <Image image={currentFrame} x={0} y={0} width={iw} height={ih} fit="fill">
          <ColorMatrix matrix={matrix} />
        </Image>
      </Group>
    </Canvas>
  );
}
