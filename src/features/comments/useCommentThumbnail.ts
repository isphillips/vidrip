import { useEffect, useState } from 'react';
import RNFS from 'react-native-fs';
import { createThumbnail } from 'react-native-create-thumbnail';
import { commentThumbPublicUrl, localPathForComment } from '../../infrastructure/storage/commentStorage';
import type { VideoComment } from '../../infrastructure/supabase/queries/videoComments';

// Cache generated local frames by source uri so scrolling never regenerates one.
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function genThumb(uri: string): Promise<string | null> {
  const hit = cache.get(uri);
  if (hit) { return Promise.resolve(hit); }
  let p = inflight.get(uri);
  if (!p) {
    // createThumbnail returns a file://-prefixed path — use it as-is (no double prefix).
    p = createThumbnail({ url: uri, timeStamp: 100, format: 'jpeg' })
      .then(({ path }) => { cache.set(uri, path); return path; })
      .catch(() => null)
      .finally(() => { inflight.delete(uri); });
    inflight.set(uri, p);
  }
  return p;
}

/**
 * A thumbnail for a comment tile. Resolution order:
 *  1. `local_path` — this device's just-recorded clip, still uploading → generate a frame locally.
 *  2. an on-disk copy at the comment's local path — the author's own past comments → generate locally.
 *  3. the stored thumbnail URL (`<authorId>/<commentId>.jpg`) uploaded at record time → load directly.
 * Returns null while resolving / when nothing is available (the row shows a play tile). Remote
 * frame-grabbing is intentionally NOT attempted — the device's extractor can't read the cloud
 * URLs, which is why thumbnails are generated locally at record time and stored instead.
 */
export function useCommentThumbnail(comment: VideoComment): string | null {
  const local = comment.local_path ?? null;
  const remote = comment.video_url ? commentThumbPublicUrl(comment.author_id, comment.id) : null;
  const [thumb, setThumb] = useState<string | null>(() => (local ? cache.get(`file://${local.replace(/^file:\/\//, '')}`) ?? null : remote));

  useEffect(() => {
    let alive = true;

    if (local) {
      const uri = local.startsWith('file://') ? local : `file://${local}`;
      const cached = cache.get(uri);
      if (cached) { setThumb(cached); return; }
      genThumb(uri).then(p => { if (alive) { setThumb(p ?? remote); } });
      return () => { alive = false; };
    }

    // No in-flight local path — prefer the author's own on-disk copy if it's still cached,
    // otherwise the stored remote thumbnail.
    const diskUri = `file://${localPathForComment(comment.id)}`;
    const diskCached = cache.get(diskUri);
    if (diskCached) { setThumb(diskCached); return; }
    setThumb(remote);
    RNFS.exists(localPathForComment(comment.id)).then(exists => {
      if (!alive || !exists) { return; }
      genThumb(diskUri).then(p => { if (alive && p) { setThumb(p); } });
    }).catch(() => {});

    return () => { alive = false; };
  }, [local, remote, comment.id]);

  return thumb;
}
