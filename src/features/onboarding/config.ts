// ── Onboarding feature flags ──────────────────────────────────────────────────────────────────
//
// CREATOR_INTRO: the extended, cinematic creator onboarding shown to UNAUTHENTICATED visitors
// (RootNavigator's signed-out branch) instead of the login/welcome flow. During the closed launch
// phase we're marketing to influencers — when they open the app they get the full pitch (studio,
// the two-view concept, tiers/dashboard, exclusivity) and a "claim your spot" email capture at the
// end, rather than a login wall. A subtle "log in" link still drops devs/creators into the auth flow.
//
// At public launch we'll flip this OFF for the general public (they get the normal login flow) and
// surface the creator intro through a separate, targeted means (not built yet). It's a plain boolean
// today by design — easy to flip per build, matching the existing DEMO_MODE pattern.
export const CREATOR_INTRO = true;
