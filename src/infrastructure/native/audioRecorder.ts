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
