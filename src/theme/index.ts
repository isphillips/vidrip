export const C = {
  // Backgrounds — warm near-black to match logo's dark warmth
  BG: 'rgb(11, 9, 8)',
  SURFACE: '#17100e',
  SURFACE_2: '#221A17',

  // Borders
  BORDER: '#413548',
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
  GOLD_DIM: 'rgba(201,162,75,0.35)',

  // Status
  SUCCESS: '#22C55E',
  DANGER: '#e056fd',
  WARNING: '#F59E0B',

  // Utility
  WHITE: '#FFFFFF',
  BLACK: '#000000',
  TRANSPARENT: 'transparent',
} as const;

// Playfair Display — high-contrast serif, 1920s editorial/speakeasy headings
// Raleway — geometric Art Nouveau sans, body + UI
export const FONT = {
  // Display (Playfair Display) — for large headings, screen titles, brand
  DISPLAY: 'PlayfairDisplay-Regular',
  DISPLAY_MEDIUM: 'PlayfairDisplay-Medium',
  DISPLAY_SEMIBOLD: 'PlayfairDisplay-SemiBold',
  DISPLAY_BOLD: 'PlayfairDisplay-Bold',
  DISPLAY_ITALIC: 'PlayfairDisplay-Regular', // italic via fontStyle

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
