import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../../infrastructure/supabase/client';
import { R2_ENABLED, R2_PUBLIC_BASE, publicR2Url } from '../../../infrastructure/storage/r2Config';
import { parseMp3Meta, type Mp3Meta } from './mp3meta';

// ─── Curated music library ──────────────────────────────────────────────────────
// Tracks live in the Supabase Storage bucket "music" (public read) — drop a royalty-free file in and it
// appears, no app change. The picker streams a track's public url for preview; resolveTrackFile()
// downloads-and-caches the chosen one to a local file for the native exporter. Title/artist/duration are
// read from each file's ID3 tags (a ranged byte fetch — we never download a whole track to list it).
// NOTE: studio videos are ≤180s, so the exporter only ever uses a track's first ≤3 min; longer tracks
// are simply truncated to the video length.

const BUCKET = 'music';
const AUDIO_RE = /\.(mp3|m4a|aac|wav)$/i;
const HEAD_BYTES = 256 * 1024; // ID3v2 (incl. modest album art) + the first audio frame for VBR length

export type MusicTrack = {
  id: string;          // storage object name — stable + unique within the bucket
  title: string;
  artist?: string;
  durationSec?: number;
  url: string;         // public, streamable + downloadable
};

let _cache: MusicTrack[] | null = null;

/**
 * List the curated tracks from the "music" bucket, newest-metadata-cached. Pass force=true to refetch.
 * Resolves to [] on any storage error (the picker shows an empty state) rather than throwing.
 */
export async function listMusicTracks(force = false): Promise<MusicTrack[]> {
  if (_cache && !force) { return _cache; }

  // R2 can't be listed from the client (no Supabase storage API), so the curated set is
  // published as music/manifest.json — an array of filenames, or {name,title?,artist?,durationSec?}
  // objects (precomputed meta avoids the per-track ID3 fetch). Falls back to reading ID3 tags.
  if (R2_ENABLED) {
    try {
      const res = await fetch(`${(R2_PUBLIC_BASE.music ?? '').replace(/\/$/, '')}/manifest.json`);
      if (!res.ok) { return _cache ?? []; }
      const items = (await res.json()) as Array<string | { name: string; title?: string; artist?: string; durationSec?: number }>;
      const audio = items.filter((it) => AUDIO_RE.test(typeof it === 'string' ? it : it.name));
      const tracks = await Promise.all(audio.map(async (it): Promise<MusicTrack> => {
        const name = typeof it === 'string' ? it : it.name;
        const url = publicR2Url(BUCKET, name);
        const provided = typeof it === 'object' ? it : null;
        if (provided?.title) {
          return { id: name, url, title: provided.title, artist: provided.artist, durationSec: provided.durationSec };
        }
        const meta = await readMeta(name, url, '', undefined);
        return { id: name, url, title: meta.title || filenameTitle(name), artist: meta.artist, durationSec: meta.durationSec };
      }));
      _cache = tracks;
      return tracks;
    } catch { return _cache ?? []; }
  }

  const { data, error } = await supabase.storage.from(BUCKET).list('', {
    limit: 200,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error || !data) { return _cache ?? []; }
  // Folders come back with a null id; keep only audio objects.
  const files = data.filter(f => f.id != null && AUDIO_RE.test(f.name));
  const tracks = await Promise.all(files.map(async (f): Promise<MusicTrack> => {
    const url = supabase.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl;
    const meta = await readMeta(f.name, url, fileStamp(f), (f.metadata as any)?.size);
    return { id: f.name, url, title: meta.title || filenameTitle(f.name), artist: meta.artist, durationSec: meta.durationSec };
  }));
  _cache = tracks;
  return tracks;
}

// A change-stamp so cached metadata invalidates when a file is replaced.
const fileStamp = (f: { updated_at?: string | null; metadata?: any }) =>
  f.updated_at || f.metadata?.eTag || f.metadata?.lastModified || '';

const filenameTitle = (name: string) =>
  name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || name;

// Read ID3 metadata for one track, memoised in AsyncStorage keyed by name+stamp so re-opens are instant.
async function readMeta(name: string, url: string, stamp: string, size?: number): Promise<Mp3Meta> {
  const key = `musicmeta:${name}:${stamp}`;
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) { return JSON.parse(cached) as Mp3Meta; }
  } catch { /* ignore cache read errors */ }
  let meta: Mp3Meta = {};
  try {
    meta = parseMp3Meta(await fetchHeadBytes(url), size);
  } catch { /* metadata is best-effort — fall back to the filename title */ }
  try { await AsyncStorage.setItem(key, JSON.stringify(meta)); } catch { /* ignore cache write errors */ }
  return meta;
}

// Ranged binary GET via XHR (RN's fetch().arrayBuffer() is unreliable; XHR arraybuffer is solid).
function fetchHeadBytes(url: string, bytes = HEAD_BYTES): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.setRequestHeader('Range', `bytes=0-${bytes - 1}`);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) { resolve(new Uint8Array(xhr.response as ArrayBuffer)); }
      else { reject(new Error(`range fetch ${xhr.status}`)); }
    };
    xhr.onerror = () => reject(new Error('range fetch failed'));
    xhr.send();
  });
}

const strip = (u: string) => u.replace(/^file:\/\//, '');
const safeName = (id: string) => id.replace(/[^a-zA-Z0-9._-]/g, '_');

/**
 * Ensure a chosen track exists as a LOCAL file (what the native exporter needs) and return its
 * file:// uri. Downloads to the cache on first use, then reuses it. Pass the track's remote url.
 */
export async function resolveTrackFile(id: string, url: string): Promise<string> {
  const dest = `${RNFS.CachesDirectoryPath}/music_${safeName(id)}`; // id keeps its real extension
  if (await RNFS.exists(dest)) { return `file://${dest}`; }
  const tmp = `${dest}.part`;
  try {
    const { statusCode } = await RNFS.downloadFile({ fromUrl: url, toFile: tmp }).promise;
    if (statusCode && statusCode >= 400) { throw new Error(`download ${statusCode}`); }
    if (await RNFS.exists(dest)) { await RNFS.unlink(dest); }
    await RNFS.moveFile(tmp, dest);
    return `file://${dest}`;
  } catch (e) {
    try { if (await RNFS.exists(strip(tmp))) { await RNFS.unlink(strip(tmp)); } } catch { /* ignore */ }
    throw e;
  }
}
