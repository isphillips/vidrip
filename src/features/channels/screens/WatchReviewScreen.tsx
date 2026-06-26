import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, Platform,
} from 'react-native';
import Video from 'react-native-video';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { fetchChannelReview, type ChannelReview } from '../../../infrastructure/supabase/queries/channels';
import {
  hasLocalClip, localPathForClip, downloadChannelClip,
} from '../../../infrastructure/storage/localChannelClipStorage';
import { useAuthStore } from '../../../store/authStore';
import ContentActions from '../../../components/ContentActions';

type LoadState = 'loading' | 'downloading' | 'ready' | 'unavailable';

// Reachable from both the Channels and Feed stacks, so the props are kept minimal
// (reviewId param + goBack) rather than tied to one navigator's param list.
type Props = {
  route: { params: { reviewId: string } };
  navigation: { goBack: () => void };
};

// Plays a single review clip. Reviews are talk-to-camera, so there's no source
// PIP — just the clip, tap to play/pause. Cached under the shared clips dir by id.
export default function WatchReviewScreen({ route, navigation }: Props) {
  const { reviewId } = route.params;
  const { width, height } = useWindowDimensions();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [review, setReview] = useState<ChannelReview | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [downloadPct, setDownloadPct] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const r = await fetchChannelReview(reviewId).catch(() => null);
      if (!r) { setLoadState('unavailable'); return; }
      setReview(r);

      if (await hasLocalClip(reviewId)) {
        const path = localPathForClip(reviewId);
        setLocalUri(Platform.OS === 'ios' ? path : `file://${path}`);
        setLoadState('ready');
        return;
      }
      if (!r.video_url) { setLoadState('unavailable'); return; }

      setLoadState('downloading');
      try {
        const dest = await downloadChannelClip(reviewId, r.video_url, setDownloadPct);
        setLocalUri(Platform.OS === 'ios' ? dest : `file://${dest}`);
        setLoadState('ready');
      } catch {
        setLoadState('unavailable');
      }
    })();
  }, [reviewId]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  if (loadState === 'loading' || loadState === 'downloading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT_HOT} size="large" />
        {loadState === 'downloading' && (
          <Text style={styles.downloadText}>
            Downloading…{downloadPct > 0 ? ` ${downloadPct}%` : ''}
          </Text>
        )}
      </View>
    );
  }

  if (loadState === 'unavailable' || !localUri) {
    return (
      <View style={styles.center}>
        <Text style={styles.unavailText}>Review unavailable</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.goBack}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalDuration = duration || (review?.duration ?? 0);
  const progressPct = totalDuration > 0 ? Math.min((progress / totalDuration) * 100, 100) : 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={() => setPaused(p => !p)}>
        <Video
          ref={videoRef}
          source={{ uri: localUri }}
          style={{ width, height }}
          resizeMode="contain"
          paused={paused}
          onLoad={(d: any) => setDuration(d.duration)}
          onProgress={(d: any) => setProgress(d.currentTime)}
          onEnd={() => { setPaused(true); setProgress(0); videoRef.current?.seek(0); }}
          repeat={false}
        />
      </TouchableOpacity>

      {paused && (
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playCircle}><Text style={styles.playIcon}>▶</Text></View>
        </View>
      )}

      {/* Reviewer identity (bottom-left) + timer (bottom-right), sitting just above the scrubber. */}
      <View style={[styles.infoBar, { bottom: bottomInset + SPACE.MD }]} pointerEvents="none">
        <View style={styles.who}>
          {review?.reviewer?.avatar_url
            ? <Image source={{ uri: review.reviewer.avatar_url }} style={styles.avatar} />
            : <View style={[styles.avatar, styles.avatarFallback]}><Ionicons name="person" size={15} color={C.WHITE} /></View>}
          <Text style={styles.handle} numberOfLines={1}>Review by @{review?.reviewer?.handle ?? '?'}</Text>
        </View>
        <Text style={styles.timer}>{fmt(progress)} / {fmt(totalDuration)}</Text>
      </View>

      <View style={styles.progressTrack} pointerEvents="none">
        <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
      </View>

      {/* Report the clip / block the reviewer — UGC safety affordance (App Store 1.2). */}
      {review?.reviewer_id && review.reviewer_id !== user?.id && (
        <View style={[styles.moreBtn, { top: topInset + SPACE.LG }]}>
          <ContentActions
            // Reviews share the clip storage model and the live `target_type` set; 'clip' is the
            // established, constraint-valid target for talk-to-camera video content here.
            targetType="clip"
            targetId={reviewId}
            targetUserId={review.reviewer_id}
            handle={review.reviewer?.handle}
            color={C.WHITE}
            size={20}
          />
        </View>
      )}

      <TouchableOpacity
        style={[styles.closeBtn, { top: topInset + SPACE.LG }]}
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
    alignItems: 'center', justifyContent: 'center', gap: SPACE.MD,
  },
  unavailText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  goBack: { color: C.ACCENT_HOT, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM },
  downloadText: { color: C.MUTED, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  playOverlay: {
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, flexShrink: 1, marginRight: SPACE.MD },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.SURFACE },
  avatarFallback: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)',
  },
  handle: {
    flexShrink: 1, color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD,
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
  moreBtn: {
    position: 'absolute', right: SPACE.LG + 44,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: C.WHITE, fontSize: 16, fontFamily: FONT.BODY_BOLD, lineHeight: 20 },
});
