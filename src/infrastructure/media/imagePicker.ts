import { Alert } from 'react-native';
import { launchCamera, launchImageLibrary, type ImagePickerResponse } from 'react-native-image-picker';

export type PickedImage = { uri: string; width: number; height: number };

function firstAsset(res: ImagePickerResponse): PickedImage | null {
  if (res.didCancel) { return null; }
  if (res.errorCode) { throw new Error(res.errorMessage || 'Could not open the photo picker.'); }
  const a = res.assets?.[0];
  if (!a?.uri) { return null; }
  return { uri: a.uri, width: a.width ?? 0, height: a.height ?? 0 };
}

export type PickedVideo = { uri: string; durationSec?: number };

function firstVideo(res: ImagePickerResponse): PickedVideo | null {
  if (res.didCancel) { return null; }
  if (res.errorCode) { throw new Error(res.errorMessage || 'Could not open the video picker.'); }
  const a = res.assets?.[0];
  if (!a?.uri) { return null; }
  return { uri: a.uri, durationSec: a.duration ?? undefined };
}

/** Action sheet → record a new video or choose one from the library. */
export function pickVideo(): Promise<PickedVideo | null> {
  return new Promise((resolve, reject) => {
    Alert.alert('Add a video', undefined, [
      {
        text: 'Record',
        onPress: () => launchCamera({ mediaType: 'video', videoQuality: 'high', cameraType: 'back' })
          .then(r => resolve(firstVideo(r))).catch(reject),
      },
      {
        text: 'Choose from Library',
        onPress: () => launchImageLibrary({ mediaType: 'video', selectionLimit: 1 })
          .then(r => resolve(firstVideo(r))).catch(reject),
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

/** Action sheet → camera or library. Returns the raw (uncropped) image. */
export function pickImage(): Promise<PickedImage | null> {
  return new Promise((resolve, reject) => {
    Alert.alert('Profile photo', undefined, [
      {
        text: 'Take Photo',
        onPress: () => launchCamera({ mediaType: 'photo', cameraType: 'front', quality: 1 })
          .then(r => resolve(firstAsset(r))).catch(reject),
      },
      {
        text: 'Choose from Library',
        onPress: () => launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 1 })
          .then(r => resolve(firstAsset(r))).catch(reject),
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}
