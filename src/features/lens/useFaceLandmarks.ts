import { useState } from 'react';
import type { FaceLandmarks } from './faceLens';

// ─── Landmark source ───────────────────────────────────────────────────────────
// Contract: the latest detected face landmarks (or null when no face is visible). The real
// implementation is backed by a react-native-vision-camera v4 frame processor that calls a
// native MediaPipe Face Landmarker plugin per frame and reduces the 468-pt mesh to the
// FaceLandmarks anchors. That plugin is the remaining NATIVE work:
//
//   1. add `react-native-worklets-core` (required for v4 frame processors)
//   2. native frame-processor plugin "faceLandmarks":
//        iOS    — MediaPipe Tasks Vision (FaceLandmarker) over the CMSampleBuffer
//        Android— com.google.mediapipe:tasks-vision (FaceLandmarker) over the ImageProxy
//      bundle the face_landmarker.task model; return {leftEye,rightEye,noseTip,mouthCenter,
//      faceWidth,roll} normalized to the frame.
//   3. JS frame processor worklet calls the plugin and pushes the result into a shared value
//      (UI thread) for 60fps overlay; mirror this hook to read it.
//
// Until then this returns null so the overlay renders nothing (the rest of the pipeline —
// catalog, overlay, recipe, replay, bake — is fully wired and testable with MOCK_FACE).
export function useFaceLandmarks(): FaceLandmarks | null {
  const [landmarks] = useState<FaceLandmarks | null>(null);
  return landmarks;
}

// A centered, level face — drop into FaceLensOverlay to verify lens rendering on-device
// before the native plugin exists.
export const MOCK_FACE: FaceLandmarks = {
  leftEye: { x: 0.40, y: 0.42 },
  rightEye: { x: 0.60, y: 0.42 },
  noseTip: { x: 0.50, y: 0.52 },
  mouthCenter: { x: 0.50, y: 0.62 },
  faceWidth: 0.34,
  roll: 0,
};
