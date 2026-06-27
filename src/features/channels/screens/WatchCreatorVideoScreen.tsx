import React, { useEffect, useState } from 'react';
import BunnyEmbedPlayer from '../../studio/components/BunnyEmbedPlayer';
import { fetchChannelPost } from '../../../infrastructure/supabase/queries/channels';
import { recordView } from '../../../infrastructure/supabase/queries/views';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

// In-channel viewer for a creator (Bunny) video — plays via the signed embed. We look up the
// post's author so the player can offer Report/Block on this UGC video (App Store 1.2).
export default function WatchCreatorVideoScreen({ route, navigation }: ChannelsStackScreenProps<'WatchCreatorVideo'>) {
  const { postId } = route.params;
  const [author, setAuthor] = useState<{ id: string; handle: string | null } | null>(null);

  // Count a view on this creator/source video (deduped per viewer per day).
  useEffect(() => { recordView('post', postId); }, [postId]);

  useEffect(() => {
    let alive = true;
    fetchChannelPost(postId)
      .then((p) => { if (alive && p) { setAuthor({ id: p.poster_id, handle: p.poster?.handle ?? null }); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [postId]);

  return (
    <BunnyEmbedPlayer
      postId={postId}
      title={route.params.title ?? 'Video'}
      onClose={() => navigation.goBack()}
      reportTargetType="post"
      reportTargetId={postId}
      reportTargetUserId={author?.id}
      reportHandle={author?.handle}
    />
  );
}
