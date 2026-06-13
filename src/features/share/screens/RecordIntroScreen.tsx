import React, { useCallback } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { usePendingIntroStore } from '../../../store/pendingIntroStore';
import ReactionRecorder from '../../record/components/ReactionRecorder';
import type { RootStackParamList } from '../../../app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RecordIntro'>;

// Records a personal intro to attach to a share. No source video → ReactionRecorder
// runs in manual mode (black background + manual record button). The clip is handed
// back to the share drawer via pendingIntroStore; the actual upload happens on Send.
export default function RecordIntroScreen({ navigation }: Props) {
  const setClip = usePendingIntroStore(s => s.set);

  const onBack = useCallback(() => navigation.goBack(), [navigation]);

  const onSave = useCallback(async (filePath: string, duration: number) => {
    setClip({ path: filePath, duration });
    navigation.goBack();
  }, [setClip, navigation]);

  return (
    <ReactionRecorder
      onBack={onBack}
      uploadingText="Saving intro…"
      onSave={onSave}
      maxDuration={30}
    />
  );
}
