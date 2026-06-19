import { useAuthStore } from '../../store/authStore';

// "React Anonymously" — a per-account privacy setting (users.react_anonymously). When on, the camera
// screens force the silhouette lens, hide the lens picker, and bake a deep voice-changer into the
// recording so the user's face and voice are hidden in posted videos.
export const ANON_LENS_KEY = 'anon';
export const ANON_VOICE_MOD = 'deep' as const;
// The opaque dark backdrop for the silhouette. Used BOTH as the live overlay's base fill and as the
// off-screen bake stage's floor, so the preview and the recorded result look identical (and a missed
// Skia paint during the bake can never leak the real face through a transparent frame).
export const ANON_FLOOR = '#020306';

/** True when the signed-in user has React Anonymously enabled. */
export function useAnonymousMode(): boolean {
  const profile = useAuthStore((s) => s.profile);
  // The generated Supabase Row type lags new columns; read defensively (same pattern as
  // show_reactions_in_profile elsewhere in the app).
  return !!(profile as { react_anonymously?: boolean } | null)?.react_anonymously;
}
