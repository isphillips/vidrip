import React, { useCallback, useState } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { usePendingReactionsStore } from '../../../store/pendingReactionsStore';
import { saveReaction } from '../../../infrastructure/storage/reactionStorage';
import { localPathForReaction } from '../../../infrastructure/storage/localReactionStorage';
import { assertVideoAllowed } from '../../../infrastructure/moderation/moderateVideo';
import { STORAGE_MODE } from '../../../infrastructure/storage/config';
import ReactionRecorder from '../components/ReactionRecorder';
import IntroPreroll from '../../threads/components/IntroPreroll';
import type { RecordStackScreenProps } from '../../../app/navigation/types';

export default function RecordReactionScreen({
  route, navigation,
}: RecordStackScreenProps<'RecordReaction'>) {
  const { threadId, videoId, sourceType = 'youtube', introUrl } = route.params;
  const { user, profile } = useAuthStore();
  const enqueue = useUploadStore(s => s.enqueue);
  const addPendingReaction = usePendingReactionsStore(s => s.add);

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
        // Surface the reaction in the thread immediately (plays from the local
        // copy), before the relay upload finishes. Reconciled once it's fetched.
        onCommitted: (reactionId) => {
          addPendingReaction({
            id: reactionId,
            thread_id: threadId,
            video_url: null,
            storage_mode: STORAGE_MODE,
            duration: Math.round(duration),
            created_at: new Date().toISOString(),
            user: { handle: profile?.handle ?? '', display_name: profile?.display_name ?? '' },
            emoji_reactions: [],
            yt_video_id: videoId ?? null,
            yt_start_offset: ytStartOffset,
            source_type: sourceType,
            recorded_with_headphones: recordedWithHeadphones,
            resolvedUri: `file://${localPathForReaction(reactionId)}`,
            needsDownload: false,
          });
        },
      });
    });
  }, [user, profile, threadId, videoId, sourceType, enqueue, addPendingReaction]);

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
