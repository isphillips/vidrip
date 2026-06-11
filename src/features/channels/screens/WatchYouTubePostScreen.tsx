import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { fetchChannelPost, commitChannelClip, uploadChannelClipRelay } from '../../../infrastructure/supabase/queries/channels';
import { assertVideoAllowed } from '../../../infrastructure/moderation/moderateVideo';
import ReactionRecorder from '../../record/components/ReactionRecorder';
import { C } from '../../../theme';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

export default function WatchYouTubePostScreen({
  route, navigation,
}: ChannelsStackScreenProps<'WatchYouTubePost'>) {
  const { postId, channelId } = route.params;
  const { user } = useAuthStore();
  const enqueue = useUploadStore(s => s.enqueue);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'youtube' | 'tiktok' | 'instagram'>('youtube');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchChannelPost(postId).then(p => {
      setVideoId(p?.yt_video_id ?? null);
      setSourceUri(p?.video_url ?? null);     // instagram plays from the re-hosted file
      setSourceType(p?.source_type ?? 'youtube');
      setLoaded(true);
    });
  }, [postId]);

  const onBack = useCallback(() => navigation.goBack(), [navigation]);
  const onSave = useCallback(async (filePath: string, duration: number, _ytStartOffset: number, recordedWithHeadphones: boolean) => {
    // Moderate, then commit (row + local copy) and upload the cloud copy — all in
    // the background queue so a flagged clip is never inserted or published.
    enqueue('Posting reaction…', async () => {
      await assertVideoAllowed(filePath, { durationSec: duration, contentType: 'channel_clip' });
      const newPostId = await commitChannelClip({ channelId, userId: user!.id, filePath, duration, parentPostId: postId, recordedWithHeadphones });
      await uploadChannelClipRelay(newPostId, user!.id);
    });
  }, [channelId, postId, user, enqueue]);

  const ready = sourceType === 'instagram' ? !!sourceUri : !!videoId;
  if (!loaded || !ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT_HOT} size="large" />
      </View>
    );
  }

  return (
    <ReactionRecorder
      videoId={sourceType === 'instagram' ? undefined : (videoId ?? undefined)}
      sourceUri={sourceUri ?? undefined}
      sourceType={sourceType}
      onBack={onBack}
      uploadingText="Posting reaction…"
      onSave={onSave}
      maxDuration={180}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
});
