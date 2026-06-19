import { useAuthStore } from '../../store/authStore';

// "React Anonymously" — a per-account privacy setting (users.react_anonymously). When on, the camera
// screens force the silhouette lens, hide the lens picker, and bake a deep voice-changer into the
// recording so the user's face and voice are hidden in posted videos.
export const ANON_LENS_KEY = 'anon';
export const ANON_VOICE_MOD = 'deep' as const;

/** True when the signed-in user has React Anonymously enabled. */
export function useAnonymousMode(): boolean {
  const profile = useAuthStore((s) => s.profile);
  // The generated Supabase Row type lags new columns; read defensively (same pattern as
  // show_reactions_in_profile elsewhere in the app).
  return !!(profile as { react_anonymously?: boolean } | null)?.react_anonymously;
}
