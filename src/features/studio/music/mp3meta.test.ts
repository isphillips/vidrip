import { parseMp3Meta } from './mp3meta';

// ── helpers to synthesise ID3v2.3 tags ───────────────────────────────────────────
const latin1 = (s: string) => Array.from(s, c => c.charCodeAt(0));
const utf8 = (s: string) => Array.from(Buffer.from(s, 'utf8'));
const utf16leBom = (s: string) => {
  const out = [0xff, 0xfe];
  for (const c of s) { const code = c.charCodeAt(0); out.push(code & 0xff, (code >> 8) & 0xff); }
  return out;
};
const synchsafe = (n: number) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

// v2.3 text frame: ID(4) + size(4 plain BE) + flags(2) + [encoding byte] + text bytes.
function textFrame(id: string, enc: number, body: number[]): number[] {
  const data = [enc, ...body];
  return [...latin1(id), ...be32(data.length), 0, 0, ...data];
}

function id3v23(frames: number[]): Uint8Array {
  return new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, ...synchsafe(frames.length), ...frames]);
}

describe('parseMp3Meta — ID3v2 tags', () => {
  it('reads title, artist and TLEN duration (Latin-1)', () => {
    const bytes = id3v23([
      ...textFrame('TIT2', 0, latin1('Sunrise')),
      ...textFrame('TPE1', 0, latin1('Vidrip Audio')),
      ...textFrame('TLEN', 0, latin1('185000')), // ms — note >3min is parsed fine; the 3-min cap is in the exporter
    ]);
    expect(parseMp3Meta(bytes)).toEqual({ title: 'Sunrise', artist: 'Vidrip Audio', durationSec: 185 });
  });

  it('decodes UTF-8 and UTF-16 (BOM) text frames', () => {
    const u8 = id3v23([...textFrame('TIT2', 3, utf8('Café Noir'))]);
    expect(parseMp3Meta(u8).title).toBe('Café Noir');
    const u16 = id3v23([...textFrame('TPE1', 1, utf16leBom('Renée'))]);
    expect(parseMp3Meta(u16).artist).toBe('Renée');
  });

  it('falls back gracefully when there is no title/artist', () => {
    const bytes = id3v23([...textFrame('TLEN', 0, latin1('30000'))]);
    expect(parseMp3Meta(bytes)).toEqual({ durationSec: 30 });
  });

  it('returns an empty object for non-MP3 bytes', () => {
    expect(parseMp3Meta(new Uint8Array([0, 1, 2, 3, 4, 5]))).toEqual({});
  });
});

describe('parseMp3Meta — MPEG frame duration (no ID3)', () => {
  it('estimates CBR duration from the frame header + file size', () => {
    // MPEG1 Layer III, 128 kbps, 44.1 kHz, stereo, no Xing: FF FB 90 00 then zeros.
    const buf = new Uint8Array(48);
    buf.set([0xff, 0xfb, 0x90, 0x00], 0);
    // 1,280,000 bytes @ 128 kbps → 80s.
    expect(parseMp3Meta(buf, 1_280_000).durationSec).toBe(80);
  });
});
