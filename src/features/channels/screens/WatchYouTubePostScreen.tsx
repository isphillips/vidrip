import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { usePendingChannelReactionsStore } from '../../../store/pendingChannelReactionsStore';
import { fetchChannelPost, commitChannelClip, uploadChannelClipRelay } from '../../../infrastructure/supabase/queries/channels';
import { signCreatorVideo, fetchOverlayRecipe } from '../../../infrastructure/creatorStudio/api';
import { assertVideoAllowed } from '../../../infrastructure/moderation/moderateVideo';
import ReactionRecorder from '../../record/components/ReactionRecorder';
import { C } from '../../../theme';
import { reactionReplayRecipe, type OverlayRecipe } from '../../studio/effectRecipe';
import type { FaceLensTrack } from '../../lens/faceLens';
import type { EmojiHit } from '../../../components/EmojiFountain';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

export default function WatchYouTubePostScreen({
  route, navigation,
}: ChannelsStackScreenProps<'WatchYouTubePost'>) {
  const { postId, channelId } = route.params;
  const { user, profile } = useAuthStore();
  const enqueue = useUploadStore(s => s.enqueue);
  const addPendingReaction = usePendingChannelReactionsStore(s => s.add);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<OverlayRecipe | null>(null);
  const [sourceType, setSourceType] = useState<'youtube' | 'tiktok' | 'instagram' | 'bunny' | 'facebook'>('youtube');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchChannelPost(postId).then(async p => {
      const st = p?.source_type ?? 'youtube';
      setVideoId(p?.yt_video_id ?? null);
      setSourceUri(p?.video_url ?? null);     // instagram plays from the re-hosted file
      setSourceType(st);
      // Creator (Bunny) source plays from a short-lived signed embed URL, with its animated
      // overlay layer replayed live on top.
      if (st === 'bunny') {
        try { setEmbedUrl(await signCreatorVideo(postId)); } catch { /* leave null → not ready */ }
        fetchOverlayRecipe(postId).then(setRecipe).catch(() => {});
      }
      setLoaded(true);
    });
  }, [postId]);

  const onBack = useCallback(() => navigation.goBack(), [navigation]);
  const onSave = useCallback(async (filePath: string, duration: number, _ytStartOffset: number, recordedWithHeadphones: boolean, lensTrack?: FaceLensTrack | null, _afterthought?: { path: string; duration: number } | null, emojiTrack?: EmojiHit[]) => {
    // Moderate, then commit (row + local copy) and upload the cloud copy — all in
    // the background queue so a flagged clip is never inserted or published.
    enqueue('Posting reaction…', async () => {
      await assertVideoAllowed(filePath, { durationSec: duration, contentType: 'channel_clip' });
      const newPostId = await commitChannelClip({
        channelId, userId: user!.id, filePath, duration, parentPostId: postId, recordedWithHeadphones,
        // Persist the reactor's face-lens + thrown-emoji tracks so the clip replays both on watch.
        overlayRecipe: reactionReplayRecipe({ faceLens: lensTrack, emojiTrack }),
      });
      // Surface the reaction under the post immediately (plays from the local copy) —
      // before the slow relay upload — reconciled once ChannelPostScreen refetches.
      addPendingReaction(postId, {
        id: newPostId, channel_id: channelId, poster_id: user!.id,
        poster: { handle: profile?.handle ?? '' },
        post_type: 'clip', source_type: 'youtube',
        yt_video_id: null, yt_video_title: null, yt_video_thumbnail: null,
        video_url: null, duration: Math.round(duration), is_pinned: false,
        created_at: new Date().toISOString(), message: null,
        emoji_reactions: [], reaction_count: 0, has_my_reaction: true,
        review_count: 0, has_my_review: false, parent_post_id: postId,
        parent_yt_video_id: null, parent_source_type: 'youtube',
      });
      await uploadChannelClipRelay(newPostId, user!.id);
    });
  }, [channelId, postId, user, profile, enqueue, addPendingReaction]);

  // Instagram + Facebook creator reels play from a re-hosted MP4 file (sourceUri).
  const fileBacked = sourceType === 'instagram' || sourceType === 'facebook';
  const ready = sourceType === 'bunny' ? !!embedUrl
    : fileBacked ? !!sourceUri
    : !!videoId;
  if (!loaded || !ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT_HOT} size="large" />
      </View>
    );
  }

  return (
    <ReactionRecorder
      videoId={(fileBacked || sourceType === 'bunny') ? undefined : (videoId ?? undefined)}
      sourceUri={sourceUri ?? undefined}
      embedUrl={embedUrl ?? undefined}
      recipe={recipe}
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
