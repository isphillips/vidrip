import RNFS from 'react-native-fs';

const REACTIONS_DIR = `${RNFS.DocumentDirectoryPath}/reactions`;

export function localPathForReaction(reactionId: string): string {
  return `${REACTIONS_DIR}/${reactionId}.mp4`;
}

export async function ensureReactionsDir(): Promise<void> {
  const exists = await RNFS.exists(REACTIONS_DIR);
  if (!exists) { await RNFS.mkdir(REACTIONS_DIR); }
}

/** Move the temp file from screen capture into the permanent reactions directory. */
export async function moveToReactionsDir(tempPath: string, reactionId: string): Promise<string> {
  await ensureReactionsDir();
  const dest = localPathForReaction(reactionId);
  // Strip file:// prefix if present — RNFS works with bare paths
  const src = tempPath.replace(/^file:\/\//, '');
  await RNFS.moveFile(src, dest);
  return dest;
}

export async function hasLocalCopy(reactionId: string): Promise<boolean> {
  return RNFS.exists(localPathForReaction(reactionId));
}

/** Download a reaction from a signed cloud URL and save it locally. */
export async function downloadReaction(
  reactionId: string,
  signedUrl: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  await ensureReactionsDir();
  const dest = localPathForReaction(reactionId);

  const result = await RNFS.downloadFile({
    fromUrl: signedUrl,
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

export async function deleteReaction(reactionId: string): Promise<void> {
  const path = localPathForReaction(reactionId);
  if (await RNFS.exists(path)) { await RNFS.unlink(path); }
}

export interface LocalReactionInfo {
  reactionId: string;
  path: string;
  sizeBytes: number;
}

export async function listLocalReactions(): Promise<LocalReactionInfo[]> {
  await ensureReactionsDir();
  const items = await RNFS.readDir(REACTIONS_DIR);
  return items
    .filter(item => item.isFile() && item.name.endsWith('.mp4'))
    .map(item => ({
      reactionId: item.name.replace('.mp4', ''),
      path: item.path,
      sizeBytes: item.size,
    }));
}

export async function totalStorageUsed(): Promise<number> {
  const items = await listLocalReactions();
  return items.reduce((sum, item) => sum + item.sizeBytes, 0);
}
