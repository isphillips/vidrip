import * as tus from 'tus-js-client';
import { supabase } from '../supabase/client';
import type { OverlayRecipe } from '../../features/studio/effectRecipe';

/** The stored animated-overlay recipe for a creator video (null if it has none). */
export async function fetchOverlayRecipe(postId: string): Promise<OverlayRecipe | null> {
  // `overlay_recipe` is newer than the generated DB types, so query it untyped.
  const { data } = await (supabase.from('channel_posts') as any)
    .select('overlay_recipe')
    .eq('id', postId)
    .maybeSingle();
  return (data?.overlay_recipe as OverlayRecipe | undefined) ?? null;
}

// Creator Studio client SDK — wraps the three edge functions + the Bunny TUS upload.
// Flow: createCreatorVideo() → uploadCreatorVideo() (resumable) → (webhook flips the
// post to 'ready') → signCreatorVideo() for token-authed embed playback.

export type Visibility = 'public' | 'subscribers';

export type CreateVideoResult = {
  guid: string;
  postId: string;
  libraryId: string;
  tusEndpoint: string;
  authorizationSignature: string;
  authorizationExpire: number;
};

const STORAGE_BASE = 'https://ltpscwticavqutbzrrjb.supabase.co/storage/v1/object';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cHNjd3RpY2F2cXV0YnpycmpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDEwMTEsImV4cCI6MjA5NTc3NzAxMX0.wHXV1IFLk7UbRWOrJWZN-sjsw8Kau0Rn6OKs29debKo';

/**
 * Upload a locally-generated cover image to public storage and return its URL.
 * (Bunny's own thumbnail is token-gated, so we host our own from the source video.)
 */
export async function uploadCreatorThumbnail(localPath: string): Promise<string> {
  const fileUri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) { throw new Error('Not authenticated'); }
  const path = `creator-thumbs/${session!.user.id}-${Date.now()}.jpg`;
  const form = new FormData();
  (form as any).append('file', { uri: fileUri, type: 'image/jpeg', name: 'cover.jpg' });
  const res = await fetch(`${STORAGE_BASE}/channel-clips/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY, 'x-upsert': 'true' },
    body: form,
  });
  if (!res.ok) { throw new Error(`thumb upload ${res.status}`); }
  return supabase.storage.from('channel-clips').getPublicUrl(path).data.publicUrl;
}

/** Reserve a Bunny video + post row; returns the TUS upload credentials. `releaseDate` (ISO) marks
 * the post as scheduled — the bytes still upload now, but viewer-facing queries hide it until then. */
export async function createCreatorVideo(
  channelId: string,
  title: string,
  visibility: Visibility,
  thumbnailUrl?: string,
  overlayRecipe?: unknown | null,
  releaseDate?: string | null,
): Promise<CreateVideoResult> {
  const { data, error } = await supabase.functions.invoke('creator-video-create', {
    body: { channelId, title, visibility, thumbnailUrl, overlayRecipe, releaseDate: releaseDate ?? null },
  });
  if (error) { throw new Error(error.message); }
  if (data?.error) { throw new Error(data.error); }
  return data as CreateVideoResult;
}

export type UploadHandle = { abort: () => void };

/**
 * Resumable upload of a local video file straight to Bunny via TUS. Reports progress
 * 0..1. Resolves when the bytes are fully uploaded (encoding then happens server-side;
 * the webhook flips media_status to 'ready'). Returns a handle to cancel.
 */
export function uploadCreatorVideo(opts: {
  create: CreateVideoResult;
  fileUri: string;
  title: string;
  onProgress?: (fraction: number) => void;
}): { promise: Promise<void>; handle: UploadHandle } {
  const { create, fileUri, title, onProgress } = opts;
  const uri = fileUri.startsWith('file://') || fileUri.startsWith('content://') ? fileUri : `file://${fileUri}`;
  let upload: tus.Upload | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    (async () => {
      try {
        // Read the baked file into a real Blob ourselves and hand THAT to tus. Passing `{ uri }`
        // relies on tus's isReactNative() detection + an XHR file:// read, which silently yields a
        // 0-byte upload when either misbehaves. A real Blob takes tus's normal slice/size path and
        // is backed by native storage (not copied into JS heap), so large clips are fine.
        const res = await fetch(uri);
        const blob = await res.blob();
        if (!blob || !blob.size) { throw new Error('Baked video read as 0 bytes — the file may be missing or empty.'); }
        let lastSent = 0;
        upload = new tus.Upload(
          blob,
          {
            endpoint: create.tusEndpoint,
            chunkSize: 5 * 1024 * 1024,
            retryDelays: [0, 2000, 5000, 10000, 20000],
            removeFingerprintOnSuccess: true,
            headers: {
              AuthorizationSignature: create.authorizationSignature,
              AuthorizationExpire: String(create.authorizationExpire),
              VideoId: create.guid,
              LibraryId: String(create.libraryId),
            },
            metadata: { filetype: 'video/mp4', title },
            onError: (e) => reject(e),
            onProgress: (sent, total) => { lastSent = sent; if (total) { onProgress?.(sent / total); } },
            onSuccess: () => resolve(),
          },
        );
        upload.start();
      } catch (e) { reject(e); }
    })();
  });
  return { promise, handle: { abort: () => upload?.abort(true).catch(() => {}) } };
}

/** Re-poll Bunny for a post's encoding state and update the row — owner-only, on-demand fallback
 * for a delayed/missing webhook. Returns the refreshed media_status. */
export async function refreshCreatorVideoStatus(postId: string): Promise<MyCreatorVideo['status']> {
  const { data, error } = await supabase.functions.invoke('creator-video-status', { body: { postId } });
  if (error) { throw new Error(error.message); }
  if (data?.error) { throw new Error(data.error); }
  return (data?.mediaStatus ?? 'processing') as MyCreatorVideo['status'];
}

/** Short-lived, token-authenticated Bunny embed URL for playing a ready creator post. */
export async function signCreatorVideo(postId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('creator-video-sign', {
    body: { postId },
  });
  if (error) { throw new Error(error.message); }
  if (data?.error) { throw new Error(data.error); }
  return data.embedUrl as string;
}

export type MyCreatorVideo = {
  id: string;
  channelId: string;
  channelName: string;
  title: string;
  thumbnail: string | null;
  status: 'uploading' | 'processing' | 'ready' | 'failed' | string;
  visibility: Visibility;
  durationSec: number | null;
  createdAt: string;
  releaseDate: string | null; // ISO; non-null + future = scheduled (hidden from viewers until then)
  isExclusive: boolean;
  collectionName: string | null;  // the exclusive collection this video is in (if any)
  reactionCount: number;          // reaction clips on this video — our engagement stat (no view tracking)
  music: string | null;           // best-effort music track name baked into the export, else null
};

// Best-effort music label from the baked overlay_recipe (its audioTracks[].uri). The exact title isn't
// stored, so derive a readable name from the file; hash-like names collapse to a plain "Music".
function musicNameFromRecipe(recipe: any): string | null {
  const tracks = recipe?.audioTracks;
  if (!Array.isArray(tracks) || tracks.length === 0) { return null; }
  const uri = tracks[0]?.uri;
  if (typeof uri !== 'string') { return 'Music'; }
  try {
    const last = decodeURIComponent(uri.split('?')[0].split('/').pop() ?? '');
    const name = last.replace(/\.(mp3|m4a|aac|wav)$/i, '').replace(/[_-]+/g, ' ').trim();
    return name && !/^[0-9a-f]{16,}$/i.test(name) ? name : 'Music';
  } catch { return 'Music'; }
}

/** A creator post scheduled for the future (release_date > now). Powers the studio calendar. */
export type ScheduledPost = {
  id: string;
  channelId: string;
  title: string;
  thumbnail: string | null;
  status: MyCreatorVideo['status'];
  releaseDate: string; // ISO, always in the future for this list
};

/** Is Creator Studio enabled for this user? (admin-granted flag). */
export async function fetchCanCreate(userId: string): Promise<boolean> {
  const { data } = await (supabase as any)
    .from('users').select('creator_studio').eq('id', userId).maybeSingle();
  return !!data?.creator_studio;
}

export type PostableChannel = { id: string; name: string; isMembersOnly: boolean };

/** Channels the creator can publish to (ones they own). */
export async function fetchPostableChannels(userId: string): Promise<PostableChannel[]> {
  const { data, error } = await (supabase as any)
    .from('groups')
    .select('id, name, is_members_only')
    .eq('created_by', userId)
    .order('name');
  if (error) { throw error; }
  return (data ?? []).map((g: any) => ({
    id: g.id, name: g.name ?? 'Channel', isMembersOnly: !!g.is_members_only,
  }));
}

/** The signed-in creator's own uploads, for the "My Studio" manage list. One query: pulls the reaction
 *  count (child clips), exclusive-collection membership, channel name, and the baked music in the joins. */
export async function fetchMyCreatorVideos(userId: string): Promise<MyCreatorVideo[]> {
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .select('id, channel_id, yt_video_title, yt_video_thumbnail, media_status, visibility, duration, created_at, release_date, is_exclusive, overlay_recipe, reactions:channel_posts!parent_post_id(count), collection_videos(collection:exclusive_collections(name)), channel:groups(name)')
    .eq('poster_id', userId)
    .eq('post_type', 'creator')
    .order('created_at', { ascending: false });
  if (error) { throw error; }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    channelId: r.channel_id,
    channelName: r.channel?.name ?? 'Channel',
    title: r.yt_video_title ?? 'Untitled',
    thumbnail: r.yt_video_thumbnail ?? null,
    status: r.media_status ?? 'processing',
    visibility: (r.visibility ?? 'public') as Visibility,
    durationSec: r.duration ?? null,
    createdAt: r.created_at,
    releaseDate: r.release_date ?? null,
    isExclusive: !!r.is_exclusive,
    collectionName: r.collection_videos?.[0]?.collection?.name ?? null,
    reactionCount: Array.isArray(r.reactions) ? (r.reactions[0]?.count ?? 0) : 0,
    music: musicNameFromRecipe(r.overlay_recipe),
  }));
}

export type CreatorVideoEdit = {
  title: string;
  visibility: Visibility;
  channelId: string;
  releaseDate: string | null;
  isExclusive: boolean;
  isMembersOnly: boolean;       // channel is members-only → visibility locked to subscribers
  collectionId: string | null;  // the exclusive collection it's currently in (if any)
};

/** Load one creator video's current editable metadata (for the edit screen). */
export async function fetchCreatorVideoForEdit(postId: string): Promise<CreatorVideoEdit | null> {
  const { data } = await (supabase as any)
    .from('channel_posts')
    .select('yt_video_title, visibility, channel_id, release_date, is_exclusive, channel:groups(is_members_only), collection_videos(collection_id)')
    .eq('id', postId).maybeSingle();
  if (!data) { return null; }
  return {
    title: data.yt_video_title ?? '',
    visibility: (data.visibility ?? 'public') as Visibility,
    channelId: data.channel_id,
    releaseDate: data.release_date ?? null,
    isExclusive: !!data.is_exclusive,
    isMembersOnly: !!data.channel?.is_members_only,
    collectionId: data.collection_videos?.[0]?.collection_id ?? null,
  };
}

/** Edit a published video's metadata (title / visibility). Direct authenticated own-post update, like
 *  reschedulePost. Looks/music/trim are baked into the export and can't be changed here. */
export async function updateCreatorVideo(postId: string, patch: { title?: string; visibility?: Visibility }): Promise<void> {
  const row: any = {};
  if (patch.title !== undefined) { row.yt_video_title = patch.title; }
  if (patch.visibility !== undefined) { row.visibility = patch.visibility; }
  if (Object.keys(row).length === 0) { return; }
  const { error } = await (supabase as any).from('channel_posts').update(row).eq('id', postId);
  if (error) { throw error; }
}

/** The creator's posts scheduled for the future (release_date > now), for the studio calendar. */
export async function fetchScheduledPosts(userId: string): Promise<ScheduledPost[]> {
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .select('id, channel_id, yt_video_title, yt_video_thumbnail, media_status, release_date')
    .eq('poster_id', userId)
    .eq('post_type', 'creator')
    .gt('release_date', new Date().toISOString())
    .order('release_date', { ascending: true });
  if (error) { throw error; }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    channelId: r.channel_id,
    title: r.yt_video_title ?? 'Untitled',
    thumbnail: r.yt_video_thumbnail ?? null,
    status: r.media_status ?? 'processing',
    releaseDate: r.release_date,
  }));
}

/** Reschedule a post to a new time (ISO). The bytes are already in Bunny — this just moves the gate. */
export async function reschedulePost(postId: string, releaseDate: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('channel_posts').update({ release_date: releaseDate }).eq('id', postId);
  if (error) { throw error; }
}

/** Cancel a schedule → publish immediately (release_date = null makes it visible right away). */
export async function unschedulePost(postId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('channel_posts').update({ release_date: null }).eq('id', postId);
  if (error) { throw error; }
}
