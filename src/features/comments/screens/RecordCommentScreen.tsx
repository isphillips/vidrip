import React, { useCallback } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { usePendingCommentsStore } from '../../../store/pendingCommentsStore';
import { assertVideoAllowed } from '../../../infrastructure/moderation/moderateVideo';
import { commitVideoComment, uploadVideoCommentRelay, localPathForComment } from '../../../infrastructure/storage/commentStorage';
import ReactionRecorder from '../../record/components/ReactionRecorder';
import type { RootStackParamList } from '../../../app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RecordComment'>;

export default function RecordCommentScreen({ route, navigation }: Props) {
  const { rootSourceId, sourceType, parentCommentId, videoTitle } = route.params;
  const { user, profile } = useAuthStore();
  const enqueue = useUploadStore(s => s.enqueue);
  const addPending = usePendingCommentsStore(s => s.add);

  const onBack = useCallback(() => navigation.goBack(), [navigation]);

  const onSave = useCallback(async (filePath: string, duration: number, _ytOffset: number, _withHeadphones: boolean) => {
    enqueue(parentCommentId ? 'Posting reply…' : 'Posting comment…', async () => {
      await assertVideoAllowed(filePath, { durationSec: duration, contentType: 'comment' });
      const commentId = await commitVideoComment({
        rootSourceId,
        sourceType,
        parentCommentId: parentCommentId ?? null,
        authorId: user!.id,
        filePath,
        duration,
      });
      // Surface it in the comments sheet immediately (plays from the local copy),
      // before the cloud upload finishes. Reconciled away once the server row is fetched.
      addPending({
        id: commentId,
        root_source_id: rootSourceId,
        source_type: sourceType,
        parent_comment_id: parentCommentId ?? null,
        author_id: user!.id,
        video_url: null,
        duration: Math.round(duration),
        reply_count: 0,
        emoji_count: 0,
        created_at: new Date().toISOString(),
        author_handle: profile?.handle ?? '',
        author_avatar_url: profile?.avatar_url ?? null,
        is_friend: false,
        local_path: localPathForComment(commentId),
      });
      await uploadVideoCommentRelay(commentId, user!.id);
    });
  }, [user, profile, rootSourceId, sourceType, parentCommentId, enqueue, addPending]);

  return (
    <ReactionRecorder
      onBack={onBack}
      uploadingText={parentCommentId ? 'Posting reply…' : 'Posting comment…'}
      onSave={onSave}
      maxDuration={60}
    />
  );
}
