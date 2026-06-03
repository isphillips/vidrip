import { Platform, NativeModules } from 'react-native';

const { ReaxnScreenRecorder } = NativeModules;

function assertModule() {
  if (!ReaxnScreenRecorder) {
    throw new Error(
      'ReaxnScreenRecorder native module not found. ' +
      'Add ReaxnScreenRecorder.swift and ReaxnScreenRecorder.m to your Xcode project, ' +
      'ensure the bridging header imports <React/RCTBridgeModule.h>, then rebuild.',
    );
  }
}

export function startScreenCapture(): Promise<void> {
  assertModule();
  return ReaxnScreenRecorder.startCapture();
}

export function stopScreenCapture(): Promise<string> {
  assertModule();
  return ReaxnScreenRecorder.stopCapture();
}

export function cancelScreenCapture(): Promise<void> {
  assertModule();
  return ReaxnScreenRecorder.cancelCapture();
}

// Android only — releases the MediaProjection and stops the foreground service.
// Call when leaving the RecordReaction screen so the recording notification clears.
export function releaseScreenCapture(): Promise<void> {
  if (Platform.OS !== 'android') { return Promise.resolve(); }
  assertModule();
  return ReaxnScreenRecorder.releaseCapture();
}
