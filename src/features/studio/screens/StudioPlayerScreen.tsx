import React from 'react';
import BunnyEmbedPlayer from '../components/BunnyEmbedPlayer';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

export default function StudioPlayerScreen({ route, navigation }: StudioStackScreenProps<'StudioPlayer'>) {
  return <BunnyEmbedPlayer postId={route.params.postId} title={route.params.title} onClose={() => navigation.goBack()} />;
}
