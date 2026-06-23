// Dependency-free MP3 metadata reader for the curated music library. Parses ID3v2 (v2.2–v2.4) text
// frames for title/artist (+ TLEN for length), then falls back to the first MPEG audio frame
// (Xing/Info for VBR, bitrate×size for CBR) for duration. Pure + synchronous so it unit-tests offline.
// Callers pass only the head of the file (a ranged prefix) — duration is best-effort by design, and
// studio videos are ≤180s so we never need a long track's full length anyway.

export type Mp3Meta = { title?: string; artist?: string; durationSec?: number };

// 32-bit big-endian via multiplication (bitwise would overflow JS's signed 32-bit ints).
const u32 = (b: Uint8Array, o: number) =>
  b[o] * 0x1000000 + b[o + 1] * 0x10000 + b[o + 2] * 0x100 + b[o + 3];
// ID3 synchsafe int: 4 bytes, 7 significant bits each.
const synchsafe = (b: Uint8Array, o: number) =>
  (b[o] & 0x7f) * 0x200000 + (b[o + 1] & 0x7f) * 0x4000 + (b[o + 2] & 0x7f) * 0x80 + (b[o + 3] & 0x7f);

const ascii = (b: Uint8Array, o: number, len: number) => {
  let s = '';
  for (let k = 0; k < len; k++) { s += String.fromCharCode(b[o + k]); }
  return s;
};

function decodeUtf8(b: Uint8Array, s: number, e: number): string {
  let out = '', i = s;
  while (i < e) {
    const c = b[i++];
    if (c === 0) { break; }
    if (c < 0x80) { out += String.fromCharCode(c); }
    else if (c < 0xe0) { out += String.fromCharCode(((c & 0x1f) << 6) | (b[i++] & 0x3f)); }
    else if (c < 0xf0) { out += String.fromCharCode(((c & 0xf) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f)); }
    else {
      const cp = ((c & 0x7) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f);
      const u = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 0x3ff));
    }
  }
  return out;
}

function decodeUtf16(b: Uint8Array, s: number, e: number, bigEndian: boolean): string {
  let i = s, be = bigEndian;
  if (i + 1 < e && b[i] === 0xff && b[i + 1] === 0xfe) { i += 2; be = false; }       // BOM LE
  else if (i + 1 < e && b[i] === 0xfe && b[i + 1] === 0xff) { i += 2; be = true; }    // BOM BE
  let out = '';
  for (; i + 1 < e; i += 2) {
    const code = be ? (b[i] << 8) | b[i + 1] : (b[i + 1] << 8) | b[i];
    if (code === 0) { break; }
    out += String.fromCharCode(code);
  }
  return out;
}

// ID3v2 text-frame encodings: 0=ISO-8859-1, 1=UTF-16 w/BOM, 2=UTF-16BE, 3=UTF-8.
function decodeText(enc: number, b: Uint8Array, start: number, end: number): string {
  if (enc === 1) { return decodeUtf16(b, start, end, false); }
  if (enc === 2) { return decodeUtf16(b, start, end, true); }
  if (enc === 3) { return decodeUtf8(b, start, end); }
  let out = '';
  for (let i = start; i < end; i++) { if (b[i] === 0) { break; } out += String.fromCharCode(b[i]); }
  return out;
}

// MPEG-1/2/2.5 Layer III tables (kbps / Hz), indexed by the header's bitrate/sample-rate index.
const BR_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BR_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SR: Record<number, number[]> = {
  3: [44100, 48000, 32000, 0], // MPEG1
  2: [22050, 24000, 16000, 0], // MPEG2
  0: [11025, 12000, 8000, 0],  // MPEG2.5
};

const isFrameSync = (b: Uint8Array, o: number) =>
  o + 1 < b.length && b[o] === 0xff && (b[o + 1] & 0xe0) === 0xe0;

function findSync(b: Uint8Array, from: number): number {
  for (let i = Math.max(0, from); i + 1 < b.length; i++) { if (isFrameSync(b, i)) { return i; } }
  return -1;
}

// Duration from the first audio frame: Xing/Info VBR frame count if present, else CBR from bitrate.
function mpegDuration(b: Uint8Array, frameOffset: number, fileSize?: number): number | undefined {
  let o = isFrameSync(b, frameOffset) ? frameOffset : findSync(b, frameOffset);
  if (o < 0 || o + 4 > b.length) { return undefined; }
  const verBits = (b[o + 1] >> 3) & 3;     // 3=MPEG1, 2=MPEG2, 0=MPEG2.5 (1=reserved)
  const layerBits = (b[o + 1] >> 1) & 3;   // 1=Layer III
  if (layerBits !== 1) { return undefined; }
  const sr = (SR[verBits] || [])[(b[o + 2] >> 2) & 3];
  if (!sr) { return undefined; }
  const isV1 = verBits === 3;
  const bitrate = (isV1 ? BR_V1_L3 : BR_V2_L3)[(b[o + 2] >> 4) & 0xf];
  const samplesPerFrame = isV1 ? 1152 : 576;
  const mono = ((b[o + 3] >> 6) & 3) === 3;
  // Xing/Info sits at a fixed offset into the first frame (depends on version + channel mode).
  const xoff = o + (isV1 ? (mono ? 21 : 36) : (mono ? 13 : 21));
  if (xoff + 12 <= b.length) {
    const tag = ascii(b, xoff, 4);
    if ((tag === 'Xing' || tag === 'Info') && (u32(b, xoff + 4) & 1)) {
      const frames = u32(b, xoff + 8);
      if (frames > 0) { return (frames * samplesPerFrame) / sr; }
    }
  }
  if (bitrate > 0 && fileSize && fileSize > frameOffset) {
    return ((fileSize - frameOffset) * 8) / (bitrate * 1000); // CBR estimate
  }
  return undefined;
}

/**
 * Parse title/artist/duration from the head bytes of an MP3. `fileSize` (from storage metadata) lets us
 * estimate CBR duration when there's no VBR header. Returns only the fields it can confidently read.
 */
export function parseMp3Meta(bytes: Uint8Array, fileSize?: number): Mp3Meta {
  const meta: Mp3Meta = {};
  let firstFrameOffset = 0;
  let tlenMs: number | undefined;

  // ID3v2 tag: "ID3", major, minor, flags, 4-byte synchsafe size (excludes the 10-byte header).
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const major = bytes[3];
    const flags = bytes[5];
    const tagSize = synchsafe(bytes, 6);
    firstFrameOffset = 10 + tagSize;
    const tagEnd = Math.min(10 + tagSize, bytes.length);
    let p = 10;
    if (flags & 0x40) { // extended header — skip it
      p += major >= 4 ? synchsafe(bytes, p) : u32(bytes, p) + 4;
    }
    const v22 = major === 2;                       // v2.2 = 3-char IDs + 3-byte sizes
    const hdrLen = v22 ? 6 : 10;
    while (p + hdrLen <= tagEnd) {
      const id = ascii(bytes, p, v22 ? 3 : 4);
      if (id.charCodeAt(0) === 0) { break; }        // hit padding
      const size = v22
        ? bytes[p + 3] * 0x10000 + bytes[p + 4] * 0x100 + bytes[p + 5]
        : major >= 4 ? synchsafe(bytes, p + 4) : u32(bytes, p + 4);
      const dataStart = p + hdrLen;
      if (size <= 0 || dataStart >= tagEnd) { break; }
      const dataEnd = Math.min(dataStart + size, tagEnd);
      if (id[0] === 'T') {
        const text = decodeText(bytes[dataStart], bytes, dataStart + 1, dataEnd).trim();
        if ((id === 'TIT2' || id === 'TT2') && !meta.title) { meta.title = text || undefined; }
        else if ((id === 'TPE1' || id === 'TP1') && !meta.artist) { meta.artist = text || undefined; }
        else if (id === 'TLEN' || id === 'TLE') { const n = parseInt(text, 10); if (n > 0) { tlenMs = n; } }
      }
      p = dataStart + size;
    }
  }

  if (tlenMs && tlenMs > 0) { meta.durationSec = Math.round(tlenMs / 1000); }
  else { const d = mpegDuration(bytes, firstFrameOffset, fileSize); if (d) { meta.durationSec = Math.round(d); } }
  return meta;
}
