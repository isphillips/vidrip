import { useEffect } from 'react';
import { useFaceTracking } from './faceTracking';
import { useSpikeFrameProcessor } from './spikeFrameProcessor';

// One-time warm-up for the reaction recorder's heaviest cost. Measured on a OnePlus 10 Pro, opening
// the recorder cold spent ~2.9s purely in useFaceTracking + useSpikeFrameProcessor — i.e. CREATING the
// frame-processor worklets, which spins up the worklets-core / Skia frame-processor runtime on first
// use. That cost is in the hook render, NOT the camera (camera attach was ~1ms) and NOT the native
// views (~0ms), so we can pay it here with NO <Camera> mounted (so no camera+WebView OOM risk).
//
// The worklet runtime is a process-global singleton, so once warmed it stays warm for the whole
// session and the first real recorder open drops from ~3s to ~0.1s. Mount this off the critical path
// (e.g. the Feed, after the screen settles) so the spin-up happens while the user is browsing rather
// than after they tap to react.
let warmed = false;
export function recorderWarmed() { return warmed; }

export default function RecorderWarmup() {
  useFaceTracking();              // creates the face-tracking frame processor (+ runOnJS) worklets
  useSpikeFrameProcessor(false);  // creates the Skia frame processor worklet (body gated off)
  useEffect(() => { warmed = true; }, []);
  return null;
}
