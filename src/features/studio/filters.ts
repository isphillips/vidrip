import {
  type CMatrix, IDENTITY, compose, saturation, contrast, brightness, channelGain,
} from './colorMatrix';

export type FilterCategory = { key: string; label: string };
export const FILTER_CATEGORIES: FilterCategory[] = [
  { key: 'basic',   label: 'Basic' },
  { key: 'moody',   label: 'Moody' },
  { key: 'vibrant', label: 'Vibrant' },
  { key: 'film',    label: 'Film' },
  { key: 'vibe',    label: 'Vibe' },
];

export type StudioFilterDef = { key: string; label: string; matrix: CMatrix; category: string };

const sepia: CMatrix = [
  0.393, 0.769, 0.189, 0, 0,
  0.349, 0.686, 0.168, 0, 0,
  0.272, 0.534, 0.131, 0, 0,
  0, 0, 0, 1, 0,
];

export const STUDIO_FILTERS: StudioFilterDef[] = [
  // ── Basic ────────────────────────────────────────────────────────────────
  { key: 'none',    label: 'None',    category: 'basic',   matrix: IDENTITY },
  { key: 'vivid',   label: 'Vivid',   category: 'basic',   matrix: compose(saturation(1.4), contrast(1.1)) },
  { key: 'pop',     label: 'Pop',     category: 'basic',   matrix: compose(saturation(1.65), contrast(1.15), brightness(0.04)) },
  { key: 'crisp',   label: 'Crisp',   category: 'basic',   matrix: compose(contrast(1.22), saturation(0.9)) },

  // ── Moody ────────────────────────────────────────────────────────────────
  { key: 'mono',    label: 'Mono',    category: 'moody',   matrix: saturation(0) },
  { key: 'noir',    label: 'Noir',    category: 'moody',   matrix: compose(saturation(0), contrast(1.38)) },
  { key: 'tonal',   label: 'Tonal',   category: 'moody',   matrix: compose(saturation(0), contrast(0.82)) },
  { key: 'fade',    label: 'Fade',    category: 'moody',   matrix: compose(saturation(0.82), contrast(0.78), brightness(0.07)) },
  { key: 'shadow',  label: 'Shadow',  category: 'moody',   matrix: compose(contrast(1.45), brightness(-0.06), saturation(0.68)) },
  { key: 'dusk',    label: 'Dusk',    category: 'moody',   matrix: compose(channelGain(1.05, 0.93, 0.78), saturation(0.78), contrast(0.88)) },

  // ── Vibrant ───────────────────────────────────────────────────────────────
  { key: 'sunset',  label: 'Sunset',  category: 'vibrant', matrix: compose(channelGain(1.18, 0.97, 0.82), contrast(1.06), saturation(1.18)) },
  { key: 'warm',    label: 'Warm',    category: 'vibrant', matrix: compose(channelGain(1.12, 1.02, 0.88), saturation(1.12)) },
  { key: 'cool',    label: 'Cool',    category: 'vibrant', matrix: compose(channelGain(0.88, 1.0, 1.16), saturation(1.06)) },
  { key: 'tropic',  label: 'Tropic',  category: 'vibrant', matrix: compose(channelGain(0.82, 1.18, 1.02), saturation(1.32)) },
  { key: 'punch',   label: 'Punch',   category: 'vibrant', matrix: compose(saturation(1.85), contrast(1.22)) },

  // ── Film ─────────────────────────────────────────────────────────────────
  { key: 'sepia',   label: 'Sepia',   category: 'film',    matrix: sepia },
  { key: 'kodak',   label: 'Kodak',   category: 'film',    matrix: compose(channelGain(1.1, 1.0, 0.84), contrast(0.87), brightness(0.05)) },
  { key: 'fuji',    label: 'Fuji',    category: 'film',    matrix: compose(channelGain(0.94, 1.06, 1.0), contrast(0.88), saturation(0.88)) },
  { key: 'cross',   label: 'Cross',   category: 'film',    matrix: compose(channelGain(1.12, 0.84, 1.18), saturation(1.22), contrast(1.1)) },
  { key: 'vhs',     label: 'VHS',     category: 'film',    matrix: compose(channelGain(1.06, 1.06, 0.88), contrast(0.84), saturation(0.78)) },

  // ── Vibe ─────────────────────────────────────────────────────────────────
  { key: 'y2k',     label: 'Y2K',     category: 'vibe',    matrix: compose(channelGain(0.88, 0.84, 1.28), saturation(1.42), contrast(1.1)) },
  { key: 'golden',  label: 'Golden',  category: 'vibe',    matrix: compose(channelGain(1.22, 1.06, 0.62), saturation(1.22), brightness(0.06)) },
  { key: 'ice',     label: 'Ice',     category: 'vibe',    matrix: compose(channelGain(0.84, 0.94, 1.32), saturation(0.84), contrast(1.06)) },
  { key: 'glam',    label: 'Glam',    category: 'vibe',    matrix: compose(channelGain(1.16, 1.0, 0.84), saturation(1.32), brightness(0.07), contrast(1.06)) },
  { key: 'berry',   label: 'Berry',   category: 'vibe',    matrix: compose(channelGain(1.0, 0.84, 1.18), saturation(1.22), contrast(1.12)) },
  { key: 'emerald', label: 'Emerald', category: 'vibe',    matrix: compose(channelGain(0.84, 1.18, 0.88), saturation(1.22), contrast(1.06)) },
];
