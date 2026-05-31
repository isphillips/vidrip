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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import {
  fetchReactionById,
  type ReactionItem,
} from '../../../infrastructure/supabase/queries/threads';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

export default function WatchReactionScreen({
  route,
  navigation,
}: FeedStackScreenProps<'WatchReaction'>) {
  const { reactionId } = route.params;
  const { width, height } = useWindowDimensions();
  const { top: topInset } = useSafeAreaInsets();

  const [reaction, setReaction] = useState<ReactionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);

  const videoRef = useRef<any>(null);

  useEffect(() => {
    fetchReactionById(reactionId)
      .then(setReaction)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reactionId]);

  const handleTogglePlay = useCallback(() => setPaused(p => !p), []);

  const handleEnd = useCallback(() => {
    setPaused(true);
    setProgress(0);
    videoRef.current?.seek(0);
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
  const progressPct = duration > 0 ? Math.min((progress / duration) * 100, 100) : 0;

  return (
    <View style={styles.container}>
      {/* Full-screen reaction video — contains YouTube + face in one recording */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={handleTogglePlay}>
        <Video
          ref={videoRef}
          source={{ uri: reaction.video_url }}
          style={{ width, height }}
          resizeMode="contain"
          paused={paused}
          onLoad={(d: any) => setDuration(d.duration)}
          onProgress={(d: any) => setProgress(d.currentTime)}
          onEnd={handleEnd}
          onBuffer={(d: any) => setBuffering(d.isBuffering)}
          onError={(e: any) => console.error('[WatchReaction] error:', JSON.stringify(e))}
          repeat={false}
        />
      </TouchableOpacity>

      {/* Buffering */}
      {buffering && !paused && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={C.WHITE} size="large" />
        </View>
      )}

      {/* Pause overlay */}
      {paused && !buffering && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.playCircle}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>
      )}

      {/* Handle + timer */}
      <View style={[styles.infoBar, { top: topInset + SPACE.SM }]} pointerEvents="none">
        <Text style={styles.handle}>@{handle}</Text>
        <Text style={styles.timer}>{fmt(progress)} / {fmt(duration || reaction.duration)}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack} pointerEvents="none">
        <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
      </View>

      {/* Close */}
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playCircle: {
    width: 72, height: 72, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  playIcon: { color: C.WHITE, fontSize: 26, marginLeft: 5 },
  infoBar: {
    position: 'absolute', left: SPACE.LG, right: SPACE.LG,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  handle: {
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
