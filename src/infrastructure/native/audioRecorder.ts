import { NativeModules } from 'react-native';

const { AudioRecorder: _AR } = NativeModules;

export function startAudioRecording(): Promise<void> {
  return _AR.startRecording();
}

export function stopAudioRecording(): Promise<{ path: string; duration: number }> {
  return _AR.stopRecording();
}

export function cancelAudioRecording(): Promise<void> {
  return _AR.cancelRecording();
}

export function configureForVideoRecording(): Promise<void> {
  // iOS-only: AVAudioSession play-and-record setup. Android has no equivalent (audio routing is
  // handled by routeAudioToSpeaker/configureForMixedPlayback), so the native method doesn't exist
  // there — guard the METHOD, not just the module, or calling undefined() throws on every recorder
  // mount (`_AR.configureForVideoRecording is not a function`).
  if (!_AR?.configureForVideoRecording) { return Promise.resolve(); }
  return _AR.configureForVideoRecording();
}

export function configureForMixedPlayback(): Promise<void> {
  if (!_AR) { return Promise.resolve(); }
  return _AR.configureForMixedPlayback();
}

export function checkHeadphonesConnected(): Promise<boolean> {
  return _AR.checkHeadphonesConnected();
}

export function routeAudioToSpeaker(): Promise<void> {
  return _AR.routeAudioToSpeaker();
}

export function restoreAudioRoute(): Promise<void> {
  return _AR.restoreAudioRoute();
}
