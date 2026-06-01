import { NativeModules } from 'react-native';

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
