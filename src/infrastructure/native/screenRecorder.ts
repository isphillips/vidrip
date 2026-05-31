import { NativeModules } from 'react-native';

const { ReaxnScreenRecorder } = NativeModules;

export function startScreenCapture(): Promise<void> {
  return ReaxnScreenRecorder.startCapture();
}

export function stopScreenCapture(): Promise<string> {
  return ReaxnScreenRecorder.stopCapture();
}

export function cancelScreenCapture(): Promise<void> {
  return ReaxnScreenRecorder.cancelCapture();
}
