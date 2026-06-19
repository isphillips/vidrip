#!/usr/bin/env bash
# Downloads the MediaPipe Face Landmarker model bundle (face_landmarker.task, ~3.7 MB) into the
# Android assets dir and the iOS project dir. Powers the 'faceMesh' frame-processor plugin (the
# 478-pt mesh + blendshapes + transform matrix track). BlazeFace (blaze_face_short_range.tflite)
# stays bundled alongside it — JS picks between them via USE_FACE_MESH in faceTracking.ts.
#
# After running, on iOS you must add ios/face_landmarker.task to the Xcode target's
# "Copy Bundle Resources" (same as blaze_face_short_range.tflite) so it ships in the app bundle.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

ANDROID_DEST="$ROOT/android/app/src/main/assets/face_landmarker.task"
IOS_DEST="$ROOT/ios/face_landmarker.task"

echo "Downloading face_landmarker.task..."
mkdir -p "$(dirname "$ANDROID_DEST")"
curl -L "$URL" -o "$ANDROID_DEST"
cp "$ANDROID_DEST" "$IOS_DEST"

echo "Installed:"
ls -lh "$ANDROID_DEST" "$IOS_DEST"
echo
echo "iOS: add ios/face_landmarker.task to the Xcode target → Build Phases → Copy Bundle Resources."
