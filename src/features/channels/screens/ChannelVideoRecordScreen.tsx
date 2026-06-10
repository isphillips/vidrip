import React, { useCallback } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { postChannelClip } from '../../../infrastructure/supabase/queries/channels';
import ReactionRecorder from '../../record/components/ReactionRecorder';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

export default function ChannelVideoRecordScreen({
  route, navigation,
}: ChannelsStackScreenProps<'ChannelVideoRecord'>) {
  const { channelId } = route.params;
  const { user } = useAuthStore();
  const enqueue = useUploadStore(s => s.enqueue);

  const onBack = useCallback(() => navigation.goBack(), [navigation]);
  const onSave = useCallback(async (filePath: string, duration: number) => {
    enqueue('Posting video…', () => postChannelClip({ channelId, userId: user!.id, filePath, duration }));
  }, [channelId, user, enqueue]);

  return (
    <ReactionRecorder
      // no videoId → black background
      onBack={onBack}
      uploadingText="Posting video…"
      onSave={onSave}
    />
  );
}
