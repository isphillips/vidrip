import React, { useCallback } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { postChannelClip } from '../../../infrastructure/supabase/queries/channels';
import ReactionRecorder from '../../record/components/ReactionRecorder';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

export default function ChannelVideoRecordScreen({
  route, navigation,
}: ChannelsStackScreenProps<'ChannelVideoRecord'>) {
  const { channelId } = route.params;
  const { user } = useAuthStore();

  const onBack = useCallback(() => navigation.goBack(), [navigation]);
  const onSave = useCallback(async (filePath: string, duration: number) => {
    await postChannelClip({ channelId, userId: user!.id, filePath, duration });
  }, [channelId, user]);

  return (
    <ReactionRecorder
      // no videoId → black background
      onBack={onBack}
      uploadingText="Posting video…"
      onSave={onSave}
    />
  );
}
