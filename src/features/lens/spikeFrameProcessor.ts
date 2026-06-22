import { useMemo } from 'react';
import { Skia, PaintStyle } from '@shopify/react-native-skia';
import { useSkiaFrameProcessor, VisionCameraProxy, runAtTargetFps } from 'react-native-vision-camera';
import { useSharedValue as useWorkletSharedValue } from 'react-native-worklets-core';

// SPIKE (snappiness A/B): draws a face-locked ring + eye dots DIRECTLY on the camera frame inside the
// Skia frame processor — fully UI-thread/GPU, like the warp lenses. No runOnJS, no React state, no
// re-render per frame. Switch lenses in the picker to compare against the React-state overlay lenses.
//
// MAPPING: identical to warpLens.faceAnchors — raw buffer coords (px = point[0]·W, py = point[1]·H).
// The points and our drawing live in the SAME frame-buffer space, so frame.render() rotates/mirrors
// both together (no orientation math). This is the proven mapping that lands warp effects on the eyes.
//
// LEAK SAFETY: the FP worklet runtime has NO GC, so we allocate NOTHING per frame — paints are built
// once on JS, the eye-anchor array is pre-allocated and mutated in place, and detection is throttled.
const RIGHT_EYE = 0, LEFT_EYE = 1;

let plugin: ReturnType<typeof VisionCameraProxy.initFrameProcessorPlugin> | undefined;
try { plugin = VisionCameraProxy.initFrameProcessorPlugin('faceLandmarks', {}); } catch { plugin = undefined; }

export function useSpikeFrameProcessor(enabled: boolean) {
  const ring = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('#FF4FA3'));
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(8);
    return p;
  }, []);
  const dot = useMemo(() => {
    const p = Skia.Paint();
    p.setColor(Skia.Color('#2DD4BF'));
    p.setStyle(PaintStyle.Fill);
    return p;
  }, []);
  // [leftX, leftY, rightX, rightY, valid] in buffer pixels. Mutated in place, never reassigned.
  const eyes = useWorkletSharedValue<number[]>([0, 0, 0, 0, 0]);

  return useSkiaFrameProcessor((frame) => {
    'worklet';
    frame.render();
    if (!enabled || !plugin) { return; }
    const e = eyes.value;
    runAtTargetFps(12, () => {
      'worklet';
      const res = plugin!.call(frame) as unknown as { points?: number[][] } | null;
      const pts = res?.points;
      if (!pts || pts.length < 6) { e[4] = 0; return; }
      const W = frame.width, H = frame.height;
      // Warp-identical: raw buffer coords (frame.render handles orientation/mirror for image + drawing).
      e[0] = pts[LEFT_EYE][0] * W; e[1] = pts[LEFT_EYE][1] * H;
      e[2] = pts[RIGHT_EYE][0] * W; e[3] = pts[RIGHT_EYE][1] * H;
      e[4] = 1;
    });
    if (e[4]) {
      const cx = (e[0] + e[2]) / 2, cy = (e[1] + e[3]) / 2;
      const eyeDist = Math.hypot(e[2] - e[0], e[3] - e[1]);
      frame.drawCircle(cx, cy, Math.max(eyeDist * 1.7, 1), ring);
      frame.drawCircle(e[0], e[1], Math.max(eyeDist * 0.16, 2), dot);
      frame.drawCircle(e[2], e[3], Math.max(eyeDist * 0.16, 2), dot);
    }
  }, [enabled, ring, dot, eyes]);
}
