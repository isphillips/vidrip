import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createThumbnail } from 'react-native-create-thumbnail';
import type { OverlayRecipe, StudioAudio } from '../../features/studio/effectRecipe';

// Studio drafts: the raw recording is copied to local storage the moment recording ends, edit
// settings autosave as the user moves through the flow, and a baked video snapshot is written at
// the Overlay→Next processing step. Everything survives a crash/close (files on disk + a JSON
// index in AsyncStorage) so the user can resume from the studio's Drafts tab. Cleared on a
// successful Bunny upload. Mirrors the RNFS conventions in localChannelClipStorage.ts.

export type StudioStage = 'trim' | 'filter' | 'audio' | 'overlay' | 'details';
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
  audio?: StudioAudio | null;         // music track(s) + mix settings (baked into the export)
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

// Copy a recorded/imported source into a local file. Handles plain file:// (incl. %-encoded paths the
// library hands back, which RNFS.copyFile can't read raw) and iOS Photos ph:// asset URIs (a different
// RNFS API). Overwrites any existing dest. Throws if the source genuinely can't be copied.
async function copyToLocal(srcUri: string, destPath: string): Promise<void> {
  if (await RNFS.exists(destPath)) { await RNFS.unlink(destPath); }
  if (srcUri.startsWith('ph://')) {
    await RNFS.copyAssetsVideoIOS(srcUri, destPath);          // Photos asset → real file (iOS)
  } else {
    await RNFS.copyFile(decodeURIComponent(strip(srcUri)), destPath);
  }
}

/**
 * Copy the just-recorded/imported clip into a draft and persist it. Pass `reuseId` to OVERWRITE an
 * existing draft (a re-recorded take in the same capture session) instead of piling up a new one — the
 * id + original createdAt are kept and every edit field is reset to a clean trim-stage draft.
 */
export async function createDraft(srcUri: string, durationSec?: number, reuseId?: string): Promise<StudioDraft> {
  const existing = reuseId ? await getDraft(reuseId) : null;
  const id = existing?.id ?? genId();
  const dir = dirFor(id);
  await ensureDir(DRAFTS_DIR);
  await ensureDir(dir);

  const rawPath = `${dir}/raw.mp4`;
  let rawFile: string;
  try {
    await copyToLocal(srcUri, rawPath);
    rawFile = fileUri(rawPath);
  } catch {
    // Last resort: edit straight off the source so the flow still works; thumbnails may be unavailable
    // if the scheme isn't readable by the thumbnailer.
    rawFile = srcUri;
  }

  // Overwriting: drop the previous baked snapshot so a resume can't surface stale footage.
  if (existing?.snapshotFile) {
    try { const sp = strip(existing.snapshotFile); if (await RNFS.exists(sp)) { await RNFS.unlink(sp); } } catch { /* ignore */ }
  }

  // Best-effort first-frame thumbnail for the drafts list.
  let thumbUri: string | null = null;
  try {
    const { path } = await createThumbnail({ url: rawFile, timeStamp: 500, format: 'jpeg' });
    const thumbPath = `${dir}/thumb.jpg`;
    if (await RNFS.exists(thumbPath)) { await RNFS.unlink(thumbPath); }
    await RNFS.copyFile(strip(path), thumbPath);
    thumbUri = fileUri(thumbPath);
  } catch { /* no thumbnail — list falls back to a placeholder */ }

  const now = Date.now();
  // Fresh draft object — overwriting resets all edit fields (trim/look/recipe/audio/details) so a
  // re-recorded take starts clean, keeping the same id + original createdAt.
  const draft: StudioDraft = {
    id, createdAt: existing?.createdAt ?? now, updatedAt: now,
    stage: 'trim', durationSec, rawFile, snapshotFile: null, thumbUri,
  };
  const drafts = await readIndex();
  const i = drafts.findIndex(d => d.id === id);
  if (i >= 0) { drafts[i] = draft; } else { drafts.push(draft); }
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
