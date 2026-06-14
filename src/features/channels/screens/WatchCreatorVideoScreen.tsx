import React from 'react';
import BunnyEmbedPlayer from '../../studio/components/BunnyEmbedPlayer';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

// In-channel viewer for a creator (Bunny) video — plays via the signed embed.
export default function WatchCreatorVideoScreen({ route, navigation }: ChannelsStackScreenProps<'WatchCreatorVideo'>) {
  return (
    <BunnyEmbedPlayer
      postId={route.params.postId}
      title={route.params.title ?? 'Video'}
      onClose={() => navigation.goBack()}
    />
  );
}
