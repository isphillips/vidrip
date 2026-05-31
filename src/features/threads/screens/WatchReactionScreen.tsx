import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import Video from 'react-native-video';
import YoutubePlayer from 'react-native-youtube-iframe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import {
  fetchReactionById,
  type ReactionItem,
} from '../../../infrastructure/supabase/queries/threads';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

const PIP_W = 88;
const PIP_H = Math.round(PIP_W * 16 / 9);
// Stable references — prevents react-native-youtube-iframe from rebuilding
// its HTML template on every render when these are inline object literals
const YT_PARAMS = { rel: false as const, controls: true as const };
const YT_WV_STYLE = { backgroundColor: '#000000' };

export default function WatchReactionScreen({
  route,
  navigation,
}: FeedStackScreenProps<'WatchReaction'>) {
  const { reactionId, videoId, videoTitle } = route.params;
  const { width, height } = useWindowDimensions();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  const isLandscape = width > height;
  const usableH = height - topInset - bottomInset - 2;
  const topH = Math.round(usableH * 0.30);
  const bottomH = usableH - topH;

  const [reaction, setReaction] = useState<ReactionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(true);
  const [progress, setProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);

  const videoRef = useRef<any>(null);

  useEffect(() => {
    fetchReactionById(reactionId)
      .then(setReaction)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reactionId]);

  // YouTube drives both videos — reaction video just follows.
  // ytPlaying must mirror YouTube's real state so react-native-youtube-iframe's
  // internal effect doesn't fight the native controls with a stale play={false}.
  const onYtStateChange = useCallback((state: string) => {
    console.log('[WatchReaction] YT state →', state);
    if (state === 'playing') {
      setPaused(false);
    } else if (state === 'paused') {
      setPaused(true);
    } else if (state === 'ended') {
      setPaused(true);
      setProgress(0);
      videoRef.current?.seek(0);
    }
  }, []);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT} size="large" />
      </View>
    );
  }

  if (!reaction) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Reaction not found</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handle = (reaction.user as any)?.handle ?? '?';
  const totalDuration = videoDuration || reaction.duration;
  const progressPct = totalDuration > 0 ? Math.min((progress / totalDuration) * 100, 100) : 0;

  const reactionVideo = (
    <Video
      ref={videoRef}
      source={{ uri: reaction.video_url }}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
      paused={paused}
      onLoad={(data: any) => { console.log('[WatchReaction] video loaded, duration:', data.duration); setVideoDuration(data.duration); }}
      onProgress={(data: any) => setProgress(data.currentTime)}
      onEnd={() => { console.log('[WatchReaction] video ended'); setPaused(true); setProgress(0); videoRef.current?.seek(0); }}
      onBuffer={(data: any) => { console.log('[WatchReaction] buffering:', data.isBuffering); setBuffering(data.isBuffering); }}
      onError={(err: any) => console.error('[WatchReaction] video ERROR:', JSON.stringify(err))}
      repeat={false}
    />
  );

  const infoBar = (
    <View style={styles.infoBar} pointerEvents="none">
      <Text style={styles.reactorHandle}>@{handle}</Text>
      <Text style={styles.timer}>{fmt(progress)} / {fmt(totalDuration)}</Text>
    </View>
  );

  const progressBar = (
    <View style={styles.progressTrack} pointerEvents="none">
      <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
    </View>
  );

  // Visual-only pause indicator — hint to use YouTube controls
  const pausedOverlay = paused && !buffering ? (
    <View style={styles.pausedHint} pointerEvents="none">
      <Text style={styles.pausedHintText}>⏸</Text>
    </View>
  ) : null;

  const bufferOverlay = buffering && !paused ? (
    <View style={styles.overlay} pointerEvents="none">
      <ActivityIndicator color={C.WHITE} size="large" />
    </View>
  ) : null;

  const ytPlayerPortrait = (
    <YoutubePlayer
      height={topH}
      width={width}
      videoId={videoId}
      play={false}
      onChangeState={onYtStateChange}
      initialPlayerParams={{ rel: false, controls: true }}
      webViewStyle={{ backgroundColor: C.BLACK }}
    />
  );

  // ─── Landscape: reaction video full-screen, YouTube Short as PiP ─────────
  if (isLandscape) {
    return (
      <View style={styles.container}>
        {/* Reaction video — full screen, no tap control */}
        <View style={StyleSheet.absoluteFill}>
          {reactionVideo}
          {bufferOverlay}
          {pausedOverlay}
        </View>

        {/* YouTube PiP — bottom right, controls enabled */}
        <View style={[styles.pip, { bottom: bottomInset + SPACE.LG, right: SPACE.LG }]}>
          <YoutubePlayer
            height={PIP_H}
            width={PIP_W}
            videoId={videoId}
            play={true}
            onChangeState={onYtStateChange}
            initialPlayerParams={YT_PARAMS}
            webViewStyle={YT_WV_STYLE}
          />
        </View>

        <View style={[styles.infoBar, { top: topInset + SPACE.SM }]} pointerEvents="none">
          <Text style={styles.reactorHandle}>@{handle}</Text>
          <Text style={styles.timer}>{fmt(progress)} / {fmt(totalDuration)}</Text>
        </View>

        {progressBar}

        {videoTitle ? (
          <View style={[styles.titleOverlay, { bottom: bottomInset + SPACE.MD }]} pointerEvents="none">
            <Text style={styles.titleText} numberOfLines={1}>{videoTitle}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.closeBtn, { top: topInset + SPACE.SM }]}
          onPress={() => navigation.goBack()}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Portrait: 30% YouTube / 70% reaction ────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={{ height: topInset, backgroundColor: C.BLACK }} />

      {/* Top 30% — YouTube with native controls */}
      <View style={[styles.pane, { height: topH }]}>
        {ytPlayerPortrait}
        {videoTitle ? (
          <View style={styles.titleOverlay} pointerEvents="none">
            <Text style={styles.titleText} numberOfLines={1}>{videoTitle}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.divider} />

      {/* Bottom 70% — reaction video, follows YouTube */}
      <View style={[styles.pane, { height: bottomH }]}>
        {reactionVideo}
        {bufferOverlay}
        {pausedOverlay}
        {infoBar}
        {progressBar}
      </View>

      <View style={{ height: bottomInset, backgroundColor: C.BLACK }} />

      <TouchableOpacity
        style={[styles.closeBtn, { top: topInset + SPACE.SM }]}
        onPress={() => navigation.goBack()}>
        <Text style={styles.closeTxt}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BLACK },
  center: {
    flex: 1, backgroundColor: C.BLACK,
    alignItems: 'center', justifyContent: 'center', gap: SPACE.LG,
  },
  errorText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  backBtn: { paddingVertical: SPACE.SM, paddingHorizontal: SPACE.MD },
  backBtnText: { color: C.ACCENT_HOT, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM },
  pane: { overflow: 'hidden', backgroundColor: C.BLACK },
  divider: { height: 2, backgroundColor: C.ACCENT },
  pip: {
    position: 'absolute',
    width: PIP_W,
    height: PIP_H,
    borderRadius: RADIUS.LG,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  titleOverlay: {
    position: 'absolute',
    bottom: SPACE.MD, left: SPACE.MD, right: SPACE.MD,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: RADIUS.SM,
    paddingHorizontal: SPACE.SM,
    paddingVertical: 4,
  },
  titleText: { color: C.WHITE, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  pausedHint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pausedHintText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY,
  },
  infoBar: {
    position: 'absolute',
    top: SPACE.MD, left: SPACE.LG, right: SPACE.LG,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reactorHandle: {
    color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  timer: {
    color: 'rgba(255,255,255,0.8)', fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  progressTrack: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 3, backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressFill: { height: 3, backgroundColor: C.ACCENT_HOT },
  closeBtn: {
    position: 'absolute', right: SPACE.LG,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: C.WHITE, fontSize: 16, fontFamily: FONT.BODY_BOLD, lineHeight: 20 },
});
