// ── Channels feature flags ──────────────────────────────────────────────────────────────────
//
// SHOW_WEB_JOIN_LINK: when true AND the user is on the US storefront, the members lock shows a plain
// "Join on the web" link (Apple's 2025 US external-link allowance). Default OFF — the app ships as a
// pure neutral lock with NO external-purchase link anywhere, for the cleanest App Store 3.1.1 review
// (a reviewer can't reach any external CTA). Flip this on in a LATER update, once approved, and ideally
// pair it with a real StoreKit storefront check (device region is only a proxy — see utils/storefront).
export const SHOW_WEB_JOIN_LINK = false;
