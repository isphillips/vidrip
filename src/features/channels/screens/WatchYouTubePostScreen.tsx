import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '../../../store/authStore';
import { fetchChannelPost, postChannelClip } from '../../../infrastructure/supabase/queries/channels';
import ReactionRecorder from '../../record/components/ReactionRecorder';
import { C } from '../../../theme';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

export default function WatchYouTubePostScreen({
  route, navigation,
}: ChannelsStackScreenProps<'WatchYouTubePost'>) {
  const { postId, channelId } = route.params;
  const { user } = useAuthStore();
  const [videoId, setVideoId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'youtube' | 'tiktok'>('youtube');

  useEffect(() => {
    fetchChannelPost(postId).then(p => {
      setVideoId(p?.yt_video_id ?? null);
      setSourceType(p?.source_type ?? 'youtube');
    });
  }, [postId]);

  const onBack = useCallback(() => navigation.goBack(), [navigation]);
  const onSave = useCallback(async (filePath: string, duration: number, _ytStartOffset: number, recordedWithHeadphones: boolean) => {
    await postChannelClip({ channelId, userId: user!.id, filePath, duration, parentPostId: postId, recordedWithHeadphones });
  }, [channelId, postId, user]);

  if (!videoId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT_HOT} size="large" />
      </View>
    );
  }

  return (
    <ReactionRecorder
      videoId={videoId}
      sourceType={sourceType}
      onBack={onBack}
      uploadingText="Posting reaction…"
      onSave={onSave}
      maxDuration={60}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
});
