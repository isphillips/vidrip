import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { usePendingReactionsStore } from '../../../store/pendingReactionsStore';
import { usePendingChannelReactionsStore } from '../../../store/pendingChannelReactionsStore';
import { useReactedThreadsStore } from '../../../store/reactedThreadsStore';
import { useIntroSeenStore } from '../../../store/introSeenStore';
import { saveReaction } from '../../../infrastructure/storage/reactionStorage';
import { localPathForReaction } from '../../../infrastructure/storage/localReactionStorage';
import { assertVideoAllowed } from '../../../infrastructure/moderation/moderateVideo';
import { STORAGE_MODE } from '../../../infrastructure/storage/config';
import {
  fetchChannelPost, fetchChannelPosts, commitChannelClip, uploadChannelClipRelay,
} from '../../../infrastructure/supabase/queries/channels';
import { signCreatorVideo, fetchOverlayRecipe } from '../../../infrastructure/creatorStudio/api';
import ReactionRecorder from '../components/ReactionRecorder';
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
  const markThreadReacted = useReactedThreadsStore(s => s.markReacted);

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
  const [chRecipe, setChRecipe] = useState<OverlayRecipe | null>(null);
  const [chSourceType, setChSourceType] =
    useState<'youtube' | 'tiktok' | 'instagram' | 'bunny' | 'facebook'>('youtube');

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
        const next = useReactQueueStore.getState().shiftNext();
        if (next) { navigation.replace('RecordReaction', { ...next, queued: true }); }
        else { navigation.goBack(); }
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
    emojiTrack?: EmojiHit[],
  ) => {
    justSavedRef.current = true;   // committed → onBack advances the doom-react queue

    // ── Channel-post reaction: commit a clip under the post (mirrors WatchYouTubePostScreen). ──
    if (isChannel && postId && channelId) {
      enqueue('Posting reaction…', async () => {
        await assertVideoAllowed(filePath, { durationSec: duration, contentType: 'channel_clip' });
        const newPostId = await commitChannelClip({
          channelId, userId: user!.id, filePath, duration, parentPostId: postId, recordedWithHeadphones,
          overlayRecipe: lensTrack ? faceLensRecipe(lensTrack) : null,
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
        // Surface the reaction in the thread immediately (plays from the local
        // copy), before the relay upload finishes. Reconciled once it's fetched.
        onCommitted: (reactionId) => {
          // Drop this share's actionable row from the Feed immediately — don't wait on the
          // backgrounded thread_members.status='reacted' write (which a focus-reload races).
          markThreadReacted(threadId!);
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
  }, [isChannel, postId, channelId, user, profile, threadId, videoId, sourceType, enqueue, addPendingReaction, addPendingChannelReaction, markThreadReacted]);

  if (introUrl && threadId && !introSeen.has(threadId)) {
    return <IntroPreroll introUrl={introUrl} onDone={() => markIntroSeen(threadId)} />;
  }

  if (isChannel) {
    const fileBacked = chSourceType === 'instagram' || chSourceType === 'facebook';
    const ready = chSourceType === 'bunny' ? !!chEmbedUrl : fileBacked ? !!chSourceUri : !!chVideoId;
    if (!chReady || !ready) {
      return <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} size="large" /></View>;
    }
    return (
      <ReactionRecorder
        videoId={(fileBacked || chSourceType === 'bunny') ? undefined : (chVideoId ?? undefined)}
        sourceUri={chSourceUri ?? undefined}
        embedUrl={chEmbedUrl ?? undefined}
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
