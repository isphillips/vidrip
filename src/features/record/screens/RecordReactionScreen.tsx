import React, { useCallback } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { saveReaction } from '../../../infrastructure/storage/reactionStorage';
import { STORAGE_MODE } from '../../../infrastructure/storage/config';
import ReactionRecorder from '../components/ReactionRecorder';
import type { RecordStackScreenProps } from '../../../app/navigation/types';

export default function RecordReactionScreen({
  route, navigation,
}: RecordStackScreenProps<'RecordReaction'>) {
  const { threadId, videoId, sourceType = 'youtube' } = route.params;
  const { user } = useAuthStore();
  const enqueue = useUploadStore(s => s.enqueue);

  const onBack = useCallback(() => navigation.goBack(), [navigation]);
  const onSave = useCallback(async (filePath: string, duration: number, ytStartOffset: number, recordedWithHeadphones: boolean) => {
    enqueue('Saving reaction…', () => saveReaction({
      userId: user!.id,
      threadId,
      filePath,
      duration,
      mode: STORAGE_MODE,
      ytVideoId: videoId,
      ytStartOffset,
      sourceType,
      recordedWithHeadphones,
    }));
  }, [user, threadId, videoId, sourceType, enqueue]);

  return (
    <ReactionRecorder
      videoId={videoId}
      sourceType={sourceType}
      onBack={onBack}
      uploadingText="Saving reaction…"
      onSave={onSave}
      maxDuration={180}
    />
  );
}
