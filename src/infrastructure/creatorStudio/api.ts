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

/** Reserve a Bunny video + post row; returns the TUS upload credentials. */
export async function createCreatorVideo(
  channelId: string,
  title: string,
  visibility: Visibility,
  thumbnailUrl?: string,
  overlayRecipe?: unknown | null,
): Promise<CreateVideoResult> {
  const { data, error } = await supabase.functions.invoke('creator-video-create', {
    body: { channelId, title, visibility, thumbnailUrl, overlayRecipe },
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
  let upload: tus.Upload;
  const promise = new Promise<void>((resolve, reject) => {
    upload = new tus.Upload(
      // RN: tus-js-client accepts a { uri } file object.
      { uri: fileUri } as any,
      {
        endpoint: create.tusEndpoint,
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
        onProgress: (sent, total) => { if (total) { onProgress?.(sent / total); } },
        onSuccess: () => resolve(),
      },
    );
    upload.start();
  });
  return { promise, handle: { abort: () => upload?.abort(true).catch(() => {}) } };
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
  title: string;
  thumbnail: string | null;
  status: 'uploading' | 'processing' | 'ready' | 'failed' | string;
  visibility: Visibility;
  durationSec: number | null;
  createdAt: string;
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

/** The signed-in creator's own uploads, for the "My Studio" manage list. */
export async function fetchMyCreatorVideos(userId: string): Promise<MyCreatorVideo[]> {
  const { data, error } = await (supabase as any)
    .from('channel_posts')
    .select('id, channel_id, yt_video_title, yt_video_thumbnail, media_status, visibility, duration, created_at')
    .eq('poster_id', userId)
    .eq('post_type', 'creator')
    .order('created_at', { ascending: false });
  if (error) { throw error; }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    channelId: r.channel_id,
    title: r.yt_video_title ?? 'Untitled',
    thumbnail: r.yt_video_thumbnail ?? null,
    status: r.media_status ?? 'processing',
    visibility: (r.visibility ?? 'public') as Visibility,
    durationSec: r.duration ?? null,
    createdAt: r.created_at,
  }));
}
