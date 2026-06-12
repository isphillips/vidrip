export const C = {
  // Screen backgrounds are transparent so the app-wide purple gradient
  // (ScreenGradient, applied via each navigator's screenLayout) shows through.
  BG: 'transparent',
  // Opaque fallback (the gradient's mid tone) for the rare non-background uses of
  // the old BG — button text/spinners drawn IN the background color, nav theme, etc.
  BG_SOLID: '#190A33',
  SURFACE: '#07000e',
  SURFACE_2: '#1b0f27',

  // Borders
  BORDER: '#261438',
  BORDER_STRONG: '#382f40',

  // Text
  INK: '#F5F0EE',
  MUTED: '#EAC9EE',
  SUBTLE: '#EAC9EE',

  // Brand — deep crimson pulled from logo wax seal
  ACCENT: '#8b22a5',        // deep wax seal crimson — primary actions
  ACCENT_MID: '#8e44ad',    // warm crimson mid — hover/active
  ACCENT_HOT: '#e056fd',    // bright crimson highlight
  ACCENT_LITE: '#2a0a33',   // dark crimson tint for surfaces

  // Gradient pair (bright → deep crimson, matches logo wax highlights)
  GRAD_START: '#C43C30',
  GRAD_END: '#8C1A14',

  // Gold — the logo's leaf, for Art-Deco linework/flourishes (onboarding)
  GOLD: '#e056fd',
  GOLD_DIM: '#71368a',

  // Status
  SUCCESS: '#22C55E',
  DANGER: '#e056fd',
  WARNING: '#F59E0B',

  // Utility
  WHITE: '#FFFFFF',
  BLACK: '#000000',
  TRANSPARENT: 'transparent',
} as const;

// Syne — geometric, modern display face (matches the new web brand)
// Raleway — geometric sans, body + UI
export const FONT = {
  // Display (Syne) — for large headings, screen titles, brand
  DISPLAY: 'Syne-Regular',
  DISPLAY_MEDIUM: 'Syne-Medium',
  DISPLAY_SEMIBOLD: 'Syne-SemiBold',
  DISPLAY_BOLD: 'Syne-Bold',
  DISPLAY_ITALIC: 'Syne-Regular', // Syne has no italic; fontStyle synthesizes

  // Body (Raleway) — for all UI text, buttons, labels, body copy
  BODY: 'Raleway-Regular',
  BODY_MEDIUM: 'Raleway-Medium',
  BODY_SEMIBOLD: 'Raleway-SemiBold',
  BODY_BOLD: 'Raleway-Bold',

  // Legacy aliases (screens not yet updated)
  REGULAR: 'Raleway-Regular',
  BOLD: 'Raleway-Bold',

  SIZES: {
    XS: 11,
    SM: 13,
    MD: 15,
    LG: 17,
    XL: 20,
    XXL: 24,
    XXXL: 32,
  },

  WEIGHTS: {
    REGULAR: '400',
    MEDIUM: '500',
    SEMIBOLD: '600',
    BOLD: '700',
    EXTRA_BOLD: '900',
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
  XL: 24,
  FULL: 999,
} as const;
