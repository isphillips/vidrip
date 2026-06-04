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

export function configureForMixedPlayback(): Promise<void> {
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
