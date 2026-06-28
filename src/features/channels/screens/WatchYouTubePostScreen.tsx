import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { useAuthStore } from '../../../store/authStore';
import { useUploadStore } from '../../../store/uploadStore';
import { usePendingChannelReactionsStore } from '../../../store/pendingChannelReactionsStore';
import { fetchChannelPost, commitChannelClip, uploadChannelClipRelay, fetchMyChannelRole, joinChannel } from '../../../infrastructure/supabase/queries/channels';
import { signCreatorVideo, fetchOverlayRecipe } from '../../../infrastructure/creatorStudio/api';
import { assertVideoAllowed } from '../../../infrastructure/moderation/moderateVideo';
import ReactionRecorder from '../../record/components/ReactionRecorder';
import GradientButton from '../../studio/components/GradientButton';
import { JoinScene } from '../components/JoinScene';
import { CopyScrim, TEXT_GLOW } from '../../../components/scene/sceneKit';
import { C, FONT, SPACE } from '../../../theme';
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
  // Posting a reaction inserts a child channel_posts row, which RLS only allows for channel members.
  // Gate the recorder on membership so a non-member sees "Join to react" instead of recording a whole
  // clip that fails on insert. `undefined` = still checking. Fail OPEN (treat as member on error) so a
  // transient lookup failure never blocks a real member — the RLS insert is still the hard backstop.
  const [isMember, setIsMember] = useState<boolean | undefined>(undefined);
  const [joining, setJoining] = useState(false);
  const insets = useSafeAreaInsets();
  const enter = useSharedValue(0);   // drives the JoinScene mount fade (only when the gate shows)

  useEffect(() => {
    if (!user?.id) { return; }
    fetchMyChannelRole(channelId, user.id)
      .then(role => setIsMember(role != null))
      .catch(() => setIsMember(true));
  }, [channelId, user?.id]);

  // Animate the inviting scene in the moment we know they're not a member (the gate is about to show).
  useEffect(() => {
    if (isMember === false) {
      enter.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
    }
  }, [isMember, enter]);

  const join = useCallback(async () => {
    if (!user?.id || joining) { return; }
    setJoining(true);
    try {
      await joinChannel(channelId, user.id);
      setIsMember(true);   // now a member → the recorder renders
    } catch (e: any) {
      Alert.alert('Join', e?.message ?? 'Could not join this channel. Try opening it from the channel page.');
    } finally {
      setJoining(false);
    }
  }, [channelId, user?.id, joining]);

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

  // Membership gate — checked before (and independent of) the source load, so a non-member gets the
  // "Join to react" prompt immediately instead of waiting for the video, and never reaches the recorder.
  if (isMember === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT_HOT} size="large" />
      </View>
    );
  }
  if (!isMember) {
    return (
      <View style={styles.gate}>
        <JoinScene enter={enter} />
        {/* Copy + CTA over the lower half; the waving huddle owns the top. */}
        <View style={[styles.gateContent, { paddingBottom: insets.bottom + SPACE.XL }]}>
          <CopyScrim style={styles.gateScrim} />
          <Text style={styles.gateTitle}>Join to react</Text>
          <Text style={styles.gateMsg}>Hop in! Join this channel to record your reaction to its videos.</Text>
          <GradientButton label="Join channel" onPress={join} loading={joining} style={styles.gateBtn} />
          <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.gateCancelBtn}>
            <Text style={styles.gateCancel}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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
  // #160826 = the scene's sky-top, so there's no flash before the gradient world paints.
  gate: { flex: 1, backgroundColor: '#160826', overflow: 'hidden' },
  gateContent: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    alignItems: 'center', paddingHorizontal: SPACE.XL, paddingTop: SPACE.XXL,
  },
  gateScrim: { top: -SPACE.XXL },   // feather the dark band a bit above the copy for contrast over the scene
  gateTitle: { color: C.WHITE, fontFamily: FONT.DISPLAY_BOLD, fontSize: FONT.SIZES.XL, marginBottom: SPACE.SM, ...TEXT_GLOW },
  gateMsg: { color: 'rgba(245,235,250,0.85)', fontFamily: FONT.BODY, fontSize: FONT.SIZES.MD, textAlign: 'center', lineHeight: 22, marginBottom: SPACE.XL, paddingHorizontal: SPACE.SM, ...TEXT_GLOW },
  gateBtn: { borderRadius: 14, overflow: 'hidden', width: '88%' },
  gateCancelBtn: { padding: SPACE.MD, marginTop: SPACE.XS },
  gateCancel: { color: 'rgba(255,255,255,0.7)', fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD, ...TEXT_GLOW },
});
