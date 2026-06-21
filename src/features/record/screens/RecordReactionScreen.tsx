import React, { useCallback } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { usePendingReactionsStore } from '../../../store/pendingReactionsStore';
import { useIntroSeenStore } from '../../../store/introSeenStore';
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
  const { threadId, videoId, sourceType = 'youtube', sourceUri, introUrl } = route.params;
  const { user, profile } = useAuthStore();
  const enqueue = useUploadStore(s => s.enqueue);
  const addPendingReaction = usePendingReactionsStore(s => s.add);

  // Sender intro shares the once-per-session gate with ThreadScreen — if the
  // recipient already saw it on opening the video, don't replay it here.
  const introSeen = useIntroSeenStore(s => s.seen);
  const markIntroSeen = useIntroSeenStore(s => s.markSeen);

  const onBack = useCallback(() => navigation.goBack(), [navigation]);
  const onSave = useCallback(async (
    filePath: string, duration: number, ytStartOffset: number, recordedWithHeadphones: boolean,
    _lensTrack?: unknown, afterthought?: { path: string; duration: number } | null,
  ) => {
    enqueue('Saving reaction…', async () => {
      // Gate on automated moderation before anything is uploaded or inserted.
      await assertVideoAllowed(filePath, { durationSec: duration, contentType: 'reaction' });
      // A Studio-clip reaction has no external source video — store it as a plain reaction
      // ('youtube' placeholder, no source id) so it plays standalone in the viewer.
      const storedSourceType = sourceType === 'studio' ? 'youtube' : sourceType;
      const storedVideoId = sourceType === 'studio' ? undefined : videoId;
      await saveReaction({
        userId: user!.id,
        threadId,
        filePath,
        duration,
        mode: STORAGE_MODE,
        ytVideoId: storedVideoId,
        ytStartOffset,
        sourceType: storedSourceType,
        recordedWithHeadphones,
        afterthought: afterthought ?? null,
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
            yt_video_id: storedVideoId ?? null,
            yt_start_offset: ytStartOffset,
            source_type: storedSourceType,
            recorded_with_headphones: recordedWithHeadphones,
            resolvedUri: `file://${localPathForReaction(reactionId)}`,
            needsDownload: false,
          });
        },
      });
    });
  }, [user, profile, threadId, videoId, sourceType, enqueue, addPendingReaction]);

  if (introUrl && !introSeen.has(threadId)) {
    return <IntroPreroll introUrl={introUrl} onDone={() => markIntroSeen(threadId)} />;
  }

  return (
    <ReactionRecorder
      videoId={videoId}
      sourceUri={sourceUri}
      sourceType={sourceType}
      onBack={onBack}
      uploadingText="Saving reaction…"
      onSave={onSave}
      maxDuration={180}
      allowAfterthought
    />
  );
}
