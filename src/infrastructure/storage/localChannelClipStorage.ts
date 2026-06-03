import RNFS from 'react-native-fs';

const CLIPS_DIR = `${RNFS.DocumentDirectoryPath}/channel-clips`;

export function localPathForClip(postId: string): string {
  return `${CLIPS_DIR}/${postId}.mp4`;
}

async function ensureClipsDir(): Promise<void> {
  const exists = await RNFS.exists(CLIPS_DIR);
  if (!exists) { await RNFS.mkdir(CLIPS_DIR); }
}

export async function hasLocalClip(postId: string): Promise<boolean> {
  return RNFS.exists(localPathForClip(postId));
}

export async function downloadChannelClip(
  postId: string,
  url: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  await ensureClipsDir();
  const dest = localPathForClip(postId);

  const result = await RNFS.downloadFile({
    fromUrl: url,
    toFile: dest,
    progress: onProgress
      ? (res) => onProgress(Math.round((res.bytesWritten / res.contentLength) * 100))
      : undefined,
  }).promise;

  if (result.statusCode !== 200) {
    throw new Error(`Download failed with status ${result.statusCode}`);
  }
  return dest;
}

export async function deleteClip(postId: string): Promise<void> {
  const path = localPathForClip(postId);
  if (await RNFS.exists(path)) { await RNFS.unlink(path); }
}
