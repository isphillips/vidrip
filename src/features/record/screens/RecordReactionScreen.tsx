import React, { useCallback, useState } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { saveReaction } from '../../../infrastructure/storage/reactionStorage';
import { assertVideoAllowed } from '../../../infrastructure/moderation/moderateVideo';
import { STORAGE_MODE } from '../../../infrastructure/storage/config';
import ReactionRecorder from '../components/ReactionRecorder';
import IntroPreroll from '../../threads/components/IntroPreroll';
import type { RecordStackScreenProps } from '../../../app/navigation/types';

export default function RecordReactionScreen({
  route, navigation,
}: RecordStackScreenProps<'RecordReaction'>) {
  const { threadId, videoId, sourceType = 'youtube', introUrl } = route.params;
  const { user } = useAuthStore();
  const enqueue = useUploadStore(s => s.enqueue);

  // If the share carries a sender intro, always play it before the recorder.
  const [introDone, setIntroDone] = useState(false);

  const onBack = useCallback(() => navigation.goBack(), [navigation]);
  const onSave = useCallback(async (filePath: string, duration: number, ytStartOffset: number, recordedWithHeadphones: boolean) => {
    enqueue('Saving reaction…', async () => {
      // Gate on automated moderation before anything is uploaded or inserted.
      await assertVideoAllowed(filePath, { durationSec: duration, contentType: 'reaction' });
      await saveReaction({
        userId: user!.id,
        threadId,
        filePath,
        duration,
        mode: STORAGE_MODE,
        ytVideoId: videoId,
        ytStartOffset,
        sourceType,
        recordedWithHeadphones,
      });
    });
  }, [user, threadId, videoId, sourceType, enqueue]);

  if (introUrl && !introDone) {
    return <IntroPreroll introUrl={introUrl} onDone={() => setIntroDone(true)} />;
  }

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
