import { supabase } from '../client';

export type PublicProfile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  created_at: string;
  show_reactions_in_profile: boolean;
};

const PROFILE_COLS =
  'id, handle, display_name, avatar_url, bio, location, created_at, show_reactions_in_profile';

/** Read another user's public profile (RLS already allows reading other users). */
export async function fetchUserProfile(userId: string): Promise<PublicProfile | null> {
  const { data, error } = await (supabase as any)
    .from('users')
    .select(PROFILE_COLS)
    .eq('id', userId)
    .single();
  if (error) { return null; }
  return data as PublicProfile;
}

/** Read a public profile by @handle (for handle taps that don't carry a user id). */
export async function fetchProfileByHandle(handle: string): Promise<PublicProfile | null> {
  const { data, error } = await (supabase as any)
    .from('users')
    .select(PROFILE_COLS)
    .eq('handle', handle.replace(/^@/, '').toLowerCase().trim())
    .maybeSingle();
  if (error) { return null; }
  return data as PublicProfile | null;
}

// ─── Profile reactions (opt-in showcase) ──────────────────────────────────────

export type ProfileReaction = {
  id: string;
  yt_video_id: string | null;
  source_type: 'youtube' | 'tiktok' | 'instagram' | null;
  duration: number | null;
  created_at: string;
};

/** A user's recent reactions for their profile — only returns rows when that user
 *  has opted in (server-gated by get_profile_reactions). */
export async function fetchProfileReactions(userId: string, lim = 9): Promise<ProfileReaction[]> {
  const { data, error } = await (supabase as any)
    .rpc('get_profile_reactions', { target: userId, lim });
  if (error) { return []; }
  return (data ?? []) as ProfileReaction[];
}

/** Flip the signed-in user's "show reactions in profile" flag. */
export async function setShowReactionsInProfile(userId: string, value: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from('users').update({ show_reactions_in_profile: value }).eq('id', userId);
  if (error) { throw error; }
}

/** Get a short-lived signed playback URL for a profile reaction (server-gated). */
export async function signProfileReaction(reactionId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('profile-reaction-sign', {
    body: { reactionId },
  });
  if (error || !data?.ok || !data?.url) { return null; }
  return data.url as string;
}

/** Thumbnail for a reaction tile. YouTube has a reliable static thumb; TikTok/IG
 *  thumbnails are short-lived signed URLs we don't store, so those fall back to a
 *  placeholder tile (handled by the renderer). */
export function reactionThumbUrl(r: ProfileReaction): string | null {
  if (r.source_type === 'youtube' && r.yt_video_id) {
    return `https://i.ytimg.com/vi/${r.yt_video_id}/hqdefault.jpg`;
  }
  return null;
}

export type ProfileFields = {
  display_name?: string;
  bio?: string | null;
  location?: string | null;
  avatar_url?: string | null;
};

/** Update the signed-in user's profile row. */
export async function updateProfile(userId: string, fields: ProfileFields): Promise<void> {
  const { error } = await (supabase as any).from('users').update(fields).eq('id', userId);
  if (error) { throw error; }
}

/**
 * Upload a local image file to the public `avatars` bucket and return its URL.
 * Replaces the user's existing avatar (fixed path) and cache-busts the URL.
 */
export async function uploadAvatar(userId: string, fileUri: string, mime = 'image/jpeg'): Promise<string> {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/avatar.${ext}`;
  // RN-safe: read the file into an ArrayBuffer via fetch.
  const arrayBuffer = await fetch(fileUri).then(r => r.arrayBuffer());
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType: mime, upsert: true });
  if (error) { throw error; }
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`; // bust cache (path is reused)
}
