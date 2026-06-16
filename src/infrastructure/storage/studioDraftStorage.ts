import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createThumbnail } from 'react-native-create-thumbnail';
import type { OverlayRecipe } from '../../features/studio/effectRecipe';

// Studio drafts: the raw recording is copied to local storage the moment recording ends, edit
// settings autosave as the user moves through the flow, and a baked video snapshot is written at
// the Overlay→Next processing step. Everything survives a crash/close (files on disk + a JSON
// index in AsyncStorage) so the user can resume from the studio's Drafts tab. Cleared on a
// successful Bunny upload. Mirrors the RNFS conventions in localChannelClipStorage.ts.

export type StudioStage = 'trim' | 'filter' | 'overlay' | 'details';
export type StudioVisibility = 'public' | 'subscribers';

export type StudioDraft = {
  id: string;
  createdAt: number;
  updatedAt: number;
  stage: StudioStage;
  durationSec?: number;
  rawFile: string;                 // file:// path to the untouched original recording
  snapshotFile?: string | null;    // file:// path to the baked video (written at Overlay→Next)
  thumbUri?: string | null;        // file:// path to a still for the drafts list
  // Autosaved edit settings (non-destructive — replayed/baked, not stored per-frame):
  trimStartMs?: number;
  trimEndMs?: number;
  filterKey?: string;                 // preset key — restores the Looks UI on resume
  adjust?: Record<string, number>;    // fine adjustment sliders (exposure/brightness/…)
  colorMatrix?: number[] | null;      // derived (filter × adjust) — carried downstream to bake
  mirror?: boolean;
  recipe?: OverlayRecipe | null;
  // Details fields:
  title?: string;
  channelId?: string | null;
  visibility?: StudioVisibility;
};

const DRAFTS_DIR = `${RNFS.DocumentDirectoryPath}/studio-drafts`;
const INDEX_KEY = '@vidrip_studio_drafts';

const dirFor = (id: string) => `${DRAFTS_DIR}/${id}`;
const strip = (u: string) => u.replace(/^file:\/\//, '');
const fileUri = (p: string) => (p.startsWith('file://') ? p : `file://${p}`);

async function ensureDir(path: string): Promise<void> {
  if (!(await RNFS.exists(path))) { await RNFS.mkdir(path); }
}

async function readIndex(): Promise<StudioDraft[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as StudioDraft[]) : [];
  } catch { return []; }
}

async function writeIndex(drafts: StudioDraft[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(drafts));
}

function genId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Copy the just-recorded/imported clip into a new draft and persist it. Returns the draft. */
export async function createDraft(srcUri: string, durationSec?: number): Promise<StudioDraft> {
  const id = genId();
  const dir = dirFor(id);
  await ensureDir(DRAFTS_DIR);
  await ensureDir(dir);

  const rawPath = `${dir}/raw.mp4`;
  let rawFile: string;
  try {
    await RNFS.copyFile(strip(srcUri), rawPath);
    rawFile = fileUri(rawPath);
  } catch {
    // Some imported URIs (ph://, content://) can't be copied directly — fall back to the source so
    // editing still works; the draft just won't have its own managed copy of the raw clip.
    rawFile = srcUri;
  }

  // Best-effort first-frame thumbnail for the drafts list.
  let thumbUri: string | null = null;
  try {
    const { path } = await createThumbnail({ url: rawFile, timeStamp: 500, format: 'jpeg' });
    const thumbPath = `${dir}/thumb.jpg`;
    await RNFS.copyFile(strip(path), thumbPath);
    thumbUri = fileUri(thumbPath);
  } catch { /* no thumbnail — list falls back to a placeholder */ }

  const now = Date.now();
  const draft: StudioDraft = { id, createdAt: now, updatedAt: now, stage: 'trim', durationSec, rawFile, snapshotFile: null, thumbUri };
  const drafts = await readIndex();
  drafts.push(draft);
  await writeIndex(drafts);
  return draft;
}

/** Merge edit settings into a draft and bump updatedAt. No-op if the draft is gone. */
export async function updateDraft(id: string, patch: Partial<StudioDraft>): Promise<void> {
  const drafts = await readIndex();
  const i = drafts.findIndex(d => d.id === id);
  if (i < 0) { return; }
  drafts[i] = { ...drafts[i], ...patch, id: drafts[i].id, updatedAt: Date.now() };
  await writeIndex(drafts);
}

/** Copy the baked video into the draft as snapshot.mp4 and record its path. */
export async function saveSnapshotVideo(id: string, bakedUri: string): Promise<void> {
  await ensureDir(dirFor(id));
  const snapPath = `${dirFor(id)}/snapshot.mp4`;
  if (await RNFS.exists(snapPath)) { await RNFS.unlink(snapPath); }
  await RNFS.copyFile(strip(bakedUri), snapPath);
  await updateDraft(id, { snapshotFile: fileUri(snapPath) });
}

/** All drafts, newest-edited first. Drops entries whose raw file no longer exists. */
export async function listDrafts(): Promise<StudioDraft[]> {
  const drafts = await readIndex();
  const checked = await Promise.all(drafts.map(async d => ({ d, ok: await RNFS.exists(strip(d.rawFile)) })));
  const live = checked.filter(c => c.ok).map(c => c.d);
  if (live.length !== drafts.length) { await writeIndex(live); }
  return live.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDraft(id: string): Promise<StudioDraft | null> {
  return (await readIndex()).find(d => d.id === id) ?? null;
}

/** Remove a draft's files and index entry (on successful upload or manual delete). */
export async function deleteDraft(id: string): Promise<void> {
  try { if (await RNFS.exists(dirFor(id))) { await RNFS.unlink(dirFor(id)); } } catch { /* ignore */ }
  const drafts = await readIndex();
  await writeIndex(drafts.filter(d => d.id !== id));
}
