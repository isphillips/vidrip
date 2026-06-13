import RNFS from 'react-native-fs';
import { supabase } from '../supabase/client';
import { postVideoComment, updateVideoCommentUrl } from '../supabase/queries/videoComments';

const SUPABASE_URL = 'https://ltpscwticavqutbzrrjb.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cHNjd3RpY2F2cXV0YnpycmpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDEwMTEsImV4cCI6MjA5NTc3NzAxMX0.wHXV1IFLk7UbRWOrJWZN-sjsw8Kau0Rn6OKs29debKo';

/** Local cache dir for comment video clips on this device. */
const COMMENT_DIR = `${RNFS.DocumentDirectoryPath}/comment-videos`;

export function localPathForComment(commentId: string): string {
  return `${COMMENT_DIR}/${commentId}.mp4`;
}

async function ensureDir(): Promise<void> {
  if (!(await RNFS.exists(COMMENT_DIR))) {
    await RNFS.mkdir(COMMENT_DIR);
  }
}

async function uploadToCloud(localPath: string, uploadPath: string): Promise<string> {
  const fileUri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) { throw new Error('Not authenticated'); }

  const formData = new FormData();
  (formData as any).append('file', { uri: fileUri, type: 'video/mp4', name: 'video.mp4' });

  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/comment-videos/${uploadPath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': ANON_KEY,
      'x-upsert': 'true',
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Upload failed (${response.status}): ${body}`);
  }

  const { data: { publicUrl } } = supabase.storage.from('comment-videos').getPublicUrl(uploadPath);
  return publicUrl;
}

// ── Two-phase commit + relay ──────────────────────────────────────────────────

interface CommitParams {
  rootSourceId: string;
  sourceType: 'youtube' | 'tiktok' | 'instagram';
  parentCommentId?: string | null;
  authorId: string;
  filePath: string;
  duration: number;
}

/**
 * Phase 1 (fast): insert the row and move the recording into the local
 * comment-videos dir keyed by the new comment id. Returns immediately — the
 * clip is playable on THIS device before the upload completes.
 */
export async function commitVideoComment(params: CommitParams): Promise<string> {
  const commentId = await postVideoComment({
    rootSourceId:    params.rootSourceId,
    sourceType:      params.sourceType,
    parentCommentId: params.parentCommentId ?? null,
    authorId:        params.authorId,
    duration:        params.duration,
  });

  await ensureDir();
  await RNFS.moveFile(
    params.filePath.replace(/^file:\/\//, ''),
    localPathForComment(commentId),
  );

  return commentId;
}

/**
 * Phase 2 (background): upload the local copy to the comment-videos bucket,
 * then set video_url on the row so other devices can download it.
 * Path: comment-videos/<authorId>/<commentId>.mp4
 */
export async function uploadVideoCommentRelay(commentId: string, authorId: string): Promise<void> {
  const localPath = localPathForComment(commentId);
  const cloudUrl = await uploadToCloud(localPath, `${authorId}/${commentId}.mp4`);
  await updateVideoCommentUrl(commentId, cloudUrl);
}
