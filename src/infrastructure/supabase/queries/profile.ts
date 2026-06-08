import { supabase } from '../client';

export type PublicProfile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  created_at: string;
};

/** Read another user's public profile (RLS already allows reading other users). */
export async function fetchUserProfile(userId: string): Promise<PublicProfile | null> {
  const { data, error } = await (supabase as any)
    .from('users')
    .select('id, handle, display_name, avatar_url, bio, location, created_at')
    .eq('id', userId)
    .single();
  if (error) { return null; }
  return data as PublicProfile;
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
