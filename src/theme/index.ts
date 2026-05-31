export const C = {
  // Backgrounds
  BG: '#0A0A0A',
  SURFACE: '#141414',
  SURFACE_2: '#1E1E1E',

  // Borders
  BORDER: '#2A2A2A',
  BORDER_STRONG: '#3A3A3A',

  // Text
  INK: '#F5F5F5',
  MUTED: '#A0A0A0',
  SUBTLE: '#606060',

  // Brand
  ACCENT: '#FF3B5C',        // primary CTA — hot pink/red
  ACCENT_LITE: '#2A0A10',
  ACCENT_2: '#7C3AED',      // secondary — violet
  ACCENT_2_LITE: '#1A0A2A',

  // Status
  SUCCESS: '#22C55E',
  DANGER: '#EF4444',
  WARNING: '#F59E0B',

  // Utility
  WHITE: '#FFFFFF',
  BLACK: '#000000',
  TRANSPARENT: 'transparent',
} as const;

export const FONT = {
  REGULAR: 'System',
  BOLD: 'System',
  SIZES: {
    XS: 11,
    SM: 13,
    MD: 15,
    LG: 17,
    XL: 20,
    XXL: 24,
    XXXL: 32,
  },
} as const;

export const SPACE = {
  XS: 4,
  SM: 8,
  MD: 12,
  LG: 16,
  XL: 24,
  XXL: 32,
  XXXL: 48,
} as const;

export const RADIUS = {
  SM: 6,
  MD: 12,
  LG: 20,
  FULL: 999,
} as const;
