import React, { useCallback } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { postReview } from '../../../infrastructure/supabase/queries/channels';
import ReactionRecorder from '../../record/components/ReactionRecorder';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

const MAX_REVIEW_SECONDS = 60;

// A review is a talk-to-camera clip sent to the creator — no source video plays,
// so the recorder shows a black background and the manual record button.
export default function RecordReviewScreen({
  route, navigation,
}: ChannelsStackScreenProps<'RecordReview'>) {
  const { postId, channelId } = route.params;
  const { user } = useAuthStore();

  const onBack = useCallback(() => navigation.goBack(), [navigation]);
  const onSave = useCallback(async (filePath: string, duration: number) => {
    await postReview({ channelId, postId, reviewerId: user!.id, filePath, duration });
  }, [channelId, postId, user]);

  return (
    <ReactionRecorder
      onBack={onBack}
      onSave={onSave}
      uploadingText="Sending review…"
      maxDuration={MAX_REVIEW_SECONDS}
    />
  );
}
