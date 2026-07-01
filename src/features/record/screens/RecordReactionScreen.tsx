import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, InteractionManager, Platform } from 'react-native';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { usePendingReactionsStore } from '../../../store/pendingReactionsStore';
import { usePendingChannelReactionsStore } from '../../../store/pendingChannelReactionsStore';
import { useIntroSeenStore } from '../../../store/introSeenStore';
import { saveReaction } from '../../../infrastructure/storage/reactionStorage';
import { localPathForReaction } from '../../../infrastructure/storage/localReactionStorage';
import { assertVideoAllowed } from '../../../infrastructure/moderation/moderateVideo';
import { STORAGE_MODE } from '../../../infrastructure/storage/config';
import {
  fetchChannelPost, fetchChannelPosts, commitChannelClip, uploadChannelClipRelay,
} from '../../../infrastructure/supabase/queries/channels';
import { signCreatorVideo, fetchOverlayRecipe } from '../../../infrastructure/creatorStudio/api';
import ReactionRecorder, { type ReactionMetrics } from '../components/ReactionRecorder';
import IntroPreroll from '../../threads/components/IntroPreroll';
import { useReactQueueStore } from '../../../store/reactQueueStore';
import { faceLensRecipe, type OverlayRecipe } from '../../studio/effectRecipe';
import { C } from '../../../theme';
import type { FaceLensTrack } from '../../lens/faceLens';
import type { EmojiHit } from '../../../components/EmojiFountain';
import type { RootStackScreenProps } from '../../../app/navigation/types';

export default function RecordReactionScreen({
  route, navigation,
}: RootStackScreenProps<'RecordReaction'>) {
  const {
    kind = 'thread', threadId, videoId, sourceType = 'youtube', sourceUri,
    postId: paramPostId, channelId, resolveChannel, introUrl, queued = false,
  } = route.params;
  // Channel doom-react resolves the first pending post lazily (so the tap transitions
  // instantly), meaning the post id can arrive after mount — hold it in state.
  const [postId, setPostId] = useState<string | undefined>(paramPostId);
  const isChannel = kind === 'channel' || !!paramPostId || !!resolveChannel;
  const { user, profile } = useAuthStore();
  const enqueue = useUploadStore(s => s.enqueue);
  const addPendingReaction = usePendingReactionsStore(s => s.add);
  const addPendingChannelReaction = usePendingChannelReactionsStore(s => s.add);

  // Sender intro shares the once-per-session gate with ThreadScreen — if the
  // recipient already saw it on opening the video, don't replay it here.
  const introSeen = useIntroSeenStore(s => s.seen);
  const markIntroSeen = useIntroSeenStore(s => s.markSeen);

  // Channel targets resolve their source video lazily (mirrors WatchYouTubePostScreen): yt id /
  // re-hosted file, or a short-lived signed bunny embed + its animated overlay recipe.
  const [chReady, setChReady] = useState(!isChannel);
  const [chVideoId, setChVideoId] = useState<string | null>(null);
  const [chSourceUri, setChSourceUri] = useState<string | null>(null);
  const [chEmbedUrl, setChEmbedUrl] = useState<string | null>(null);
  const [chThumb, setChThumb] = useState<string | null>(null);
  const [chRecipe, setChRecipe] = useState<OverlayRecipe | null>(null);
  const [chSourceType, setChSourceType] =
    useState<'youtube' | 'tiktok' | 'instagram' | 'bunny' | 'facebook'>('youtube');

  // Android only: defer the heavy ReactionRecorder mount until AFTER the screen-open transition, so
  // the nav paints an instant loading state instead of freezing on the recorder's synchronous mount
  // (camera hooks + source WebView/Camera2 cold-start blocking the first frame). iOS's native push is
  // already decoupled from JS, so it starts ready (no extra spinner frame there).
  const [transitionDone, setTransitionDone] = useState(Platform.OS !== 'android');
  useEffect(() => {
    if (Platform.OS !== 'android') { return; }
    const task = InteractionManager.runAfterInteractions(() => setTransitionDone(true));
    return () => task.cancel();
  }, []);

  // Channel doom-react: resolve this channel's first pending post on mount (so the tap
  // could transition instantly), then chain its remaining posts AHEAD of the already-queued
  // feed-thread tail. With nothing pending, fall through to that tail, else just back out.
  useEffect(() => {
    if (!resolveChannel || paramPostId || !channelId) { return; }
    let active = true;
    fetchChannelPosts(channelId, user?.id).then(posts => {
      if (!active) { return; }
      const targets = posts
        .filter(p => p.parent_post_id == null && p.poster_id !== user?.id && !p.has_my_reaction
          && (p.post_type === 'youtube' || p.post_type === 'creator'))
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      if (targets.length === 0) {
        // This channel has no reactable posts (e.g. its only unseen update was a non-video `status`
        // post). Chain to the next queued reaction if one exists (keeps the friend-thread tail
        // going); otherwise don't dead-end on a blank back-stack — open the channel so the tap
        // lands somewhere useful instead of a silent goBack().
        const next = useReactQueueStore.getState().shiftNext();
        if (next) {
          navigation.replace('RecordReaction', { ...next, queued: true });
        } else {
          useReactQueueStore.getState().clear();
          (navigation as any).navigate('Main', {
            screen: 'Channels',
            params: { screen: 'Channel', params: { channelId, channelName: '' } },
          });
        }
        return;
      }
      const [first, ...rest] = targets;
      const q = useReactQueueStore.getState();
      q.setQueue([
        ...rest.map(p => ({ kind: 'channel' as const, postId: p.id, channelId })),
        ...q.queue,
      ]);
      setPostId(first.id);
    }).catch(() => { if (active) { navigation.goBack(); } });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveChannel, paramPostId, channelId, user?.id]);

  useEffect(() => {
    if (!isChannel || !postId) { return; }
    let active = true;
    setChReady(false);
    fetchChannelPost(postId).then(async p => {
      const st = p?.source_type ?? 'youtube';
      if (!active) { return; }
      setChVideoId(p?.yt_video_id ?? null);
      setChSourceUri(p?.video_url ?? null);
      // Bunny auto-generates a thumbnail.jpg beside the HLS playlist — fall back to it when a creator
      // video has no custom thumbnail (mirrors the exclusive/channel grids), so the veil blurs a poster.
      const bunnyThumb = st === 'bunny' && typeof p?.video_url === 'string' && p.video_url.includes('playlist.m3u8')
        ? p.video_url.replace('playlist.m3u8', 'thumbnail.jpg')
        : null;
      setChThumb(p?.yt_video_thumbnail ?? bunnyThumb);
      setChSourceType(st);
      if (st === 'bunny') {
        try { const e = await signCreatorVideo(postId); if (active) { setChEmbedUrl(e); } } catch { /* not ready */ }
        fetchOverlayRecipe(postId).then(r => { if (active) { setChRecipe(r); } }).catch(() => {});
      }
      if (active) { setChReady(true); }
    });
    return () => { active = false; };
  }, [isChannel, postId]);

  // Track a just-saved reaction so the doom-react queue advances only on save (not a manual back).
  const justSavedRef = useRef(false);
  const onBack = useCallback(() => {
    if (justSavedRef.current && queued) {
      justSavedRef.current = false;
      const next = useReactQueueStore.getState().shiftNext();
      if (next) {
        navigation.replace('RecordReaction', { ...next, queued: true });
        return;
      }
      useReactQueueStore.getState().clear();
    } else if (!justSavedRef.current) {
      useReactQueueStore.getState().clear();   // user backed out → abandon the queue
    }
    navigation.goBack();
  }, [navigation, queued]);

  const onSave = useCallback(async (
    filePath: string, duration: number, ytStartOffset: number, recordedWithHeadphones: boolean,
    lensTrack?: FaceLensTrack | null, afterthought?: { path: string; duration: number } | null,
    emojiTrack?: EmojiHit[], reactionMetrics?: ReactionMetrics | null,
  ) => {
    justSavedRef.current = true;   // committed → onBack advances the doom-react queue

    // Engagement metrics persisted on the reaction (powers the auto-channel ranking). peak_smile /
    // peak_surprise are captured live (null off mesh lenses); emoji_density = throws per second.
    const metrics = {
      peakSmile: reactionMetrics?.peakSmile ?? null,
      peakSurprise: reactionMetrics?.peakSurprise ?? null,
      emojiDensity: duration > 0 && emojiTrack ? emojiTrack.length / duration : null,
    };

    // ── Channel-post reaction: commit a clip under the post (mirrors WatchYouTubePostScreen). ──
    if (isChannel && postId && channelId) {
      enqueue('Posting reaction…', async () => {
        await assertVideoAllowed(filePath, { durationSec: duration, contentType: 'channel_clip' });
        const newPostId = await commitChannelClip({
          channelId, userId: user!.id, filePath, duration, parentPostId: postId, recordedWithHeadphones,
          overlayRecipe: lensTrack ? faceLensRecipe(lensTrack) : null,
          metrics,
        });
        addPendingChannelReaction(postId, {
          id: newPostId, channel_id: channelId, poster_id: user!.id,
          poster: { handle: profile?.handle ?? '' },
          post_type: 'clip', source_type: chSourceType,
          yt_video_id: null, yt_video_title: null, yt_video_thumbnail: null,
          video_url: null, duration: Math.round(duration), is_pinned: false,
          created_at: new Date().toISOString(), message: null,
          emoji_reactions: [], reaction_count: 0, has_my_reaction: true,
          review_count: 0, has_my_review: false, parent_post_id: postId,
          parent_yt_video_id: null, parent_source_type: chSourceType,
        });
        await uploadChannelClipRelay(newPostId, user!.id);
      });
      return;
    }

    // ── Friend/group thread reaction. ──
    enqueue('Saving reaction…', async () => {
      // Gate on automated moderation before anything is uploaded or inserted.
      await assertVideoAllowed(filePath, { durationSec: duration, contentType: 'reaction' });
      // A Studio-clip reaction has no external source video — store it as a plain reaction
      // ('youtube' placeholder, no source id) so it plays standalone in the viewer.
      const storedSourceType = sourceType === 'studio' ? 'youtube' : sourceType;
      const storedVideoId = sourceType === 'studio' ? undefined : videoId;
      await saveReaction({
        userId: user!.id,
        threadId: threadId!,
        filePath,
        duration,
        mode: STORAGE_MODE,
        ytVideoId: storedVideoId,
        ytStartOffset,
        sourceType: storedSourceType,
        recordedWithHeadphones,
        afterthought: afterthought ?? null,
        emojiTrack: emojiTrack ?? null,
        metrics,
        // Surface the reaction in the thread immediately (plays from the local
        // copy), before the relay upload finishes. Reconciled once it's fetched.
        onCommitted: (reactionId) => {
          addPendingReaction({
            id: reactionId,
            thread_id: threadId!,
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
  }, [isChannel, postId, channelId, user, profile, threadId, videoId, sourceType, enqueue, addPendingReaction, addPendingChannelReaction]);

  if (introUrl && threadId && !introSeen.has(threadId)) {
    return <IntroPreroll introUrl={introUrl} onDone={() => markIntroSeen(threadId)} />;
  }

  // Paint an instant loading state while the nav transition settles (Android); the heavy recorder
  // mounts on the next tick so the transition itself never stalls.
  if (!transitionDone) {
    return <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} size="large" /></View>;
  }

  if (isChannel) {
    // Instagram is always re-hosted to a file. Facebook can be EITHER: an imported clip (file) OR a
    // shared public reel (no file → plays via the FB embed in ReactionRecorder), so it's ready with
    // either a source uri or a video id.
    const fileBacked = chSourceType === 'instagram';
    const ready =
      chSourceType === 'bunny' ? !!chEmbedUrl
      : chSourceType === 'instagram' ? !!chSourceUri
      : chSourceType === 'facebook' ? (!!chSourceUri || !!chVideoId)
      : !!chVideoId;
    if (!chReady || !ready) {
      return <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} size="large" /></View>;
    }
    return (
      <ReactionRecorder
        videoId={(fileBacked || chSourceType === 'bunny') ? undefined : (chVideoId ?? undefined)}
        sourceUri={chSourceUri ?? undefined}
        embedUrl={chEmbedUrl ?? undefined}
        sourceThumb={chThumb}
        recipe={chRecipe}
        sourceType={chSourceType}
        onBack={onBack}
        uploadingText="Posting reaction…"
        onSave={onSave}
        maxDuration={180}
        allowAfterthought={false}
      />
    );
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
      allowAfterthought={!queued}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
});
