export const C = {
  // Backgrounds — warm near-black to match logo's dark warmth
  BG: '#0C0A09',
  SURFACE: '#171210',
  SURFACE_2: '#221A17',

  // Borders
  BORDER: '#2E2420',
  BORDER_STRONG: '#3E3028',

  // Text
  INK: '#F5F0EE',
  MUTED: '#A09088',
  SUBTLE: '#655550',

  // Brand — deep crimson pulled from logo wax seal
  ACCENT: '#8C1A14',        // deep wax seal crimson — primary actions
  ACCENT_MID: '#A82820',    // warm crimson mid — hover/active
  ACCENT_HOT: '#C43C30',    // bright crimson highlight
  ACCENT_LITE: '#1C0806',   // dark crimson tint for surfaces

  // Gradient pair (bright → deep crimson, matches logo wax highlights)
  GRAD_START: '#C43C30',
  GRAD_END: '#8C1A14',

  // Status
  SUCCESS: '#22C55E',
  DANGER: '#EF4444',
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
  FULL: 999,
} as const;
