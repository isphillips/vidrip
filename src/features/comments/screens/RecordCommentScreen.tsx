import React, { useCallback } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { assertVideoAllowed } from '../../../infrastructure/moderation/moderateVideo';
import { commitVideoComment, uploadVideoCommentRelay } from '../../../infrastructure/storage/commentStorage';
import ReactionRecorder from '../../record/components/ReactionRecorder';
import type { RootStackParamList } from '../../../app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RecordComment'>;

export default function RecordCommentScreen({ route, navigation }: Props) {
  const { rootSourceId, sourceType, parentCommentId, videoTitle } = route.params;
  const { user } = useAuthStore();
  const enqueue = useUploadStore(s => s.enqueue);

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
      await uploadVideoCommentRelay(commentId, user!.id);
    });
  }, [user, rootSourceId, sourceType, parentCommentId, enqueue]);

  return (
    <ReactionRecorder
      onBack={onBack}
      uploadingText={parentCommentId ? 'Posting reply…' : 'Posting comment…'}
      onSave={onSave}
      maxDuration={60}
    />
  );
}
