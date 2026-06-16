import React, { useCallback } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { commitChannelClip, uploadChannelClipRelay } from '../../../infrastructure/supabase/queries/channels';
import { assertVideoAllowed } from '../../../infrastructure/moderation/moderateVideo';
import ReactionRecorder from '../../record/components/ReactionRecorder';
import { faceLensRecipe } from '../../studio/effectRecipe';
import type { FaceLensTrack } from '../../lens/faceLens';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

export default function ChannelVideoRecordScreen({
  route, navigation,
}: ChannelsStackScreenProps<'ChannelVideoRecord'>) {
  const { channelId } = route.params;
  const { user } = useAuthStore();
  const enqueue = useUploadStore(s => s.enqueue);

  const onBack = useCallback(() => navigation.goBack(), [navigation]);
  const onSave = useCallback(async (filePath: string, duration: number, _ytStartOffset?: number, _withHeadphones?: boolean, lensTrack?: FaceLensTrack | null) => {
    // Moderate, then commit (row + local copy) and upload the cloud copy — all in
    // the background queue so a flagged clip is never inserted or published.
    enqueue('Posting video…', async () => {
      await assertVideoAllowed(filePath, { durationSec: duration, contentType: 'channel_video' });
      const postId = await commitChannelClip({
        channelId, userId: user!.id, filePath, duration,
        overlayRecipe: lensTrack ? faceLensRecipe(lensTrack) : null,
      });
      await uploadChannelClipRelay(postId, user!.id);
    });
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
