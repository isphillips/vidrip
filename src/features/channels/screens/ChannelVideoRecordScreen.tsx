import React, { useCallback } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { commitChannelClip, uploadChannelClipRelay } from '../../../infrastructure/supabase/queries/channels';
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
    // Commit (row + local copy) before returning so the clip is watchable
    // immediately; upload the cloud copy in the background for other members.
    const postId = await commitChannelClip({ channelId, userId: user!.id, filePath, duration });
    enqueue('Posting video…', () => uploadChannelClipRelay(postId, user!.id));
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
