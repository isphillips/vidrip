import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import Video from 'react-native-video';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import { fetchReactionById, type ReactionItem } from '../../../infrastructure/supabase/queries/threads';
import { downloadAndCache, recordReactionDownload } from '../../../infrastructure/storage/reactionStorage';
import {
  fetchEmojiReactions,
  addEmojiReaction,
  removeEmojiReaction,
  type EmojiReaction,
} from '../../../infrastructure/supabase/queries/reactions';
import { useAuthStore } from '../../../store/authStore';
import type { FeedStackScreenProps } from '../../../app/navigation/types';

const QUICK_EMOJIS = ['❤️', '😂', '😮', '🔥', '👏', '😭'];
const MAX_EMOJIS_PER_USER = 10;
const PIP_WIDTH = 110;
const PIP_HEIGHT = 170;

type DownloadState = 'idle' | 'downloading' | 'ready' | 'unavailable';

function EmojiBtn({
  emoji, count, isMine, isDisabled, onPress,
}: {
  emoji: string; count: number; isMine: boolean; isDisabled: boolean; onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePress = () => {
    scale.value = withSequence(
      withSpring(1.28, { damping: 5, stiffness: 600 }),
      withSpring(1, { damping: 14, stiffness: 400 }),
    );
    onPress();
  };
  return (
    <Pressable onPress={handlePress} disabled={isDisabled}>
      <Animated.View style={[styles.emojiBtn, isMine && styles.emojiBtnActive, animStyle]}>
        <Text style={styles.emojiGlyph}>{emoji}</Text>
        {count > 0 && (
          <Text style={[styles.emojiCount, isMine && styles.emojiCountActive]}>{count}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

export default function WatchReactionScreen({
  route, navigation,
}: FeedStackScreenProps<'WatchReaction'>) {
  const { reactionId, videoId } = route.params;
  const { user } = useAuthStore();
  const { width, height } = useWindowDimensions();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();

  const [reaction, setReaction] = useState<ReactionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const [downloadPct, setDownloadPct] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);

  const [paused, setPaused] = useState(true);
  const [ytPlaying, setYtPlaying] = useState(false);
  const [ytReady, setYtReady] = useState(false); // PiP iframe ready to receive play
  const [ytMute, setYtMute] = useState(true);     // start muted so autoplay is allowed, then unmute
  const [hasStarted, setHasStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const [emojiReactions, setEmojiReactions] = useState<EmojiReaction[]>([]);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [emojiOpen, setEmojiOpen] = useState(false);

  const videoRef = useRef<any>(null);
  const ytRef = useRef<YoutubeIframeRef>(null);

  // Load reaction + emoji reactions
  useEffect(() => {
    fetchReactionById(reactionId)
      .then(async (r) => {
        if (!r) { setLoading(false); return; }
        setReaction(r);
        fetchEmojiReactions(r.id).then(setEmojiReactions).catch(() => {});

        if (r.resolvedUri && !r.needsDownload) {
          setLocalUri(r.resolvedUri);
          setDownloadState('ready');
        } else if (r.resolvedUri && r.needsDownload) {
          setDownloadState('downloading');
          try {
            const uri = await downloadAndCache(r.id, r.resolvedUri, setDownloadPct);
            setLocalUri(uri);
            setDownloadState('ready');
            if (user?.id) { recordReactionDownload(r.id, user.id).catch(() => {}); }
          } catch { setDownloadState('unavailable'); }
        } else {
          setDownloadState('unavailable');
        }
      })
      .catch(() => setDownloadState('unavailable'))
      .finally(() => setLoading(false));
  }, [reactionId, user?.id]);

  // Realtime emoji updates
  useEffect(() => {
    const channel = (supabase as any)
      .channel(`emoji:${reactionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'emoji_reactions',
        filter: `reaction_id=eq.${reactionId}`,
      }, () => {
        fetchEmojiReactions(reactionId).then(setEmojiReactions).catch(() => {});
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [reactionId]);

  // Tapping the full-screen reaction PAUSES both (pausing YouTube in code is allowed).
  // Starting/resuming must come from a real tap on the Short itself — Android
  // WebViews only honor a genuine in-player gesture for unmuted playback.
  const handleScreenTap = useCallback(() => {
    if (!hasStarted) { return; } // before first play, the Short's own tap starts things
    if (!paused) {
      setPaused(true);
      setYtPlaying(false); // pauseVideo — allowed programmatically
    }
  }, [hasStarted, paused]);

  const handleEnd = useCallback(() => {
    setPaused(true);
    setYtPlaying(false);
    setYtMute(true); // re-arm muted autoplay for the next play
    setProgress(0);
    setHasStarted(false);
    videoRef.current?.seek(0);
  }, []);

  const handleEmojiPress = useCallback(async (emoji: string) => {
    if (!reaction || !user?.id) { return; }
    if (processing.has(emoji)) { return; }
    const myMatch = emojiReactions.find(r => r.emoji === emoji && r.user_id === user.id);
    const myCount = emojiReactions.filter(r => r.user_id === user.id).length;
    if (!myMatch && myCount >= MAX_EMOJIS_PER_USER) { return; }

    setProcessing(prev => new Set([...prev, emoji]));
    try {
      if (myMatch) {
        await removeEmojiReaction(reaction.id, user.id, emoji);
        setEmojiReactions(prev => prev.filter(r => !(r.emoji === emoji && r.user_id === user.id)));
      } else {
        const newId = await addEmojiReaction(reaction.id, user.id, emoji);
        setEmojiReactions(prev => [...prev, { id: newId, emoji, user_id: user.id! }]);
      }
    } catch (e) {
      console.error('[handleEmojiPress] error:', String(e));
    }
    setProcessing(prev => { const n = new Set(prev); n.delete(emoji); return n; });
  }, [reaction, user?.id, processing, emojiReactions]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  if (loading || downloadState === 'idle') {
    return <View style={styles.center}><ActivityIndicator color={C.ACCENT} size="large" /></View>;
  }

  if (downloadState === 'downloading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT} size="large" />
        <Text style={styles.downloadText}>Downloading reaction…</Text>
        {downloadPct > 0 && (
          <View style={styles.progressWrap}>
            <View style={[styles.progressBar, { width: `${downloadPct}%` as any }]} />
          </View>
        )}
        <Text style={styles.downloadPct}>{downloadPct}%</Text>
      </View>
    );
  }

  if (downloadState === 'unavailable' || !localUri) {
    return (
      <View style={styles.center}>
        <Text style={styles.unavailableIcon}>📵</Text>
        <Text style={styles.unavailableTitle}>Not available</Text>
        <Text style={styles.unavailableText}>
          {reaction?.storage_mode === 'local'
            ? "This reaction hasn't been shared yet."
            : 'This reaction is no longer available.'}
        </Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handle = (reaction?.user as any)?.handle ?? '?';
  const totalDuration = duration || (reaction?.duration ?? 0);
  const progressPct = totalDuration > 0 ? Math.min((progress / totalDuration) * 100, 100) : 0;
  const myEmojiCount = emojiReactions.filter(r => r.user_id === user?.id).length;
  const pipBottom = bottomInset + SPACE.XL + 60;

  return (
    <View style={styles.container}>
      {/* Full screen reaction camera video — bare element so it doesn't swallow touches */}
      <Video
        ref={videoRef}
        source={{ uri: localUri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        paused={paused}
        volume={1.0}
        disableFocus={true}
        onLoad={(d: any) => setDuration(d.duration)}
        onProgress={(d: any) => setProgress(d.currentTime)}
        onEnd={handleEnd}
        onError={(e: any) => console.error('[WatchReaction] error:', JSON.stringify(e))}
        repeat={false}
      />

      {/* Transparent touch-catcher ON TOP of the video — the Video's TextureView
          eats touches on Android. Tapping here PAUSES (resume is via the Short). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleScreenTap} />

      {/* YouTube Short PiP — bottom-right corner. Must stay interactive (no
          pointerEvents="none") so a real tap reaches the WebView — that gesture
          is the only thing Android lets start unmuted YouTube playback. The
          reaction video follows the Short's actual play state. */}
      <View style={[styles.pip, { bottom: pipBottom, right: SPACE.MD }]}>
        <YoutubePlayer
          ref={ytRef}
          height={PIP_HEIGHT}
          width={PIP_WIDTH}
          videoId={videoId}
          play={ytPlaying}
          mute={ytMute}
          volume={25}
          onReady={() => setYtReady(true)}
          onChangeState={(s: string) => {
            if (s === 'playing') {
              setHasStarted(true);
              if (ytMute) { setYtMute(false); }   // unmute to 25% (volume prop)
              setYtPlaying(true);                  // keep our state matching reality
              setPaused(false);                    // start/resume reaction in sync
            } else if (s === 'paused') {
              setYtPlaying(false);
              setPaused(true);                     // keep reaction paused in lockstep
            } else if (s === 'ended') {
              handleEnd();
            }
          }}
          onError={(e: string) => console.warn('[WatchReaction] yt error:', e)}
          initialPlayerParams={{ rel: false, controls: false, modestbranding: true, playsinline: true }}
          webViewStyle={{ backgroundColor: C.BLACK }}
          webViewProps={{ mediaPlaybackRequiresUserGesture: false }}
        />
      </View>

      {/* Spinner while the Short loads */}
      {!ytReady && (
        <View style={styles.playOverlay} pointerEvents="none">
          <ActivityIndicator color={C.WHITE} size="large" />
        </View>
      )}

      {/* Prompt pointing at the Short — shown whenever paused (initial + after pause).
          The user must tap the Short itself to start/resume (real WebView gesture). */}
      {ytReady && paused && (
        <View
          style={[styles.tapHint, { bottom: pipBottom + PIP_HEIGHT + SPACE.SM, right: SPACE.MD }]}
          pointerEvents="none">
          <Text style={styles.tapHintText}>Tap the Short to play ▶</Text>
          <Text style={styles.tapHintArrow}>↓</Text>
        </View>
      )}

      {/* Handle + timer */}
      <View style={[styles.infoBar, { top: topInset + SPACE.SM }]} pointerEvents="none">
        <Text style={styles.handle}>@{handle}</Text>
        <Text style={styles.timer}>{fmt(progress)} / {fmt(totalDuration)}</Text>
      </View>

      {/* Emoji drawer */}
      <View style={[styles.emojiDrawer, { bottom: bottomInset + SPACE.LG, left: SPACE.MD }]}>
        {emojiOpen && (
          <View style={styles.emojiList}>
            {QUICK_EMOJIS.map((emoji) => {
              const count = emojiReactions.filter(r => r.emoji === emoji).length;
              const isMine = emojiReactions.some(r => r.emoji === emoji && r.user_id === user?.id);
              const atLimit = !isMine && myEmojiCount >= MAX_EMOJIS_PER_USER;
              return (
                <EmojiBtn
                  key={emoji}
                  emoji={emoji}
                  count={count}
                  isMine={isMine}
                  isDisabled={processing.has(emoji) || atLimit}
                  onPress={() => handleEmojiPress(emoji)}
                />
              );
            })}
          </View>
        )}
        <TouchableOpacity
          style={[styles.emojiToggle, emojiOpen && styles.emojiToggleOpen]}
          onPress={() => setEmojiOpen(o => !o)}
          activeOpacity={0.8}>
          <Text style={styles.emojiToggleIcon}>{emojiOpen ? '✕' : '😊'}</Text>
        </TouchableOpacity>
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
    alignItems: 'center', justifyContent: 'center', gap: SPACE.MD,
  },
  downloadText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  downloadPct: { color: C.MUTED, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  progressWrap: {
    width: 200, height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: RADIUS.FULL, overflow: 'hidden',
  },
  progressBar: { height: 4, backgroundColor: C.ACCENT_HOT, borderRadius: RADIUS.FULL },
  unavailableIcon: { fontSize: 48 },
  unavailableTitle: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, marginTop: SPACE.SM },
  unavailableText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, textAlign: 'center', paddingHorizontal: SPACE.XL },
  backBtn: { marginTop: SPACE.MD, paddingVertical: SPACE.SM, paddingHorizontal: SPACE.LG },
  backBtnText: { color: C.ACCENT_HOT, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM },

  pip: {
    position: 'absolute',
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
    borderRadius: RADIUS.LG,
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: C.WHITE,
  },

  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  playCircle: {
    width: 80, height: 80, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  playIcon: { color: C.WHITE, fontSize: 30, marginLeft: 6 },

  tapHint: {
    position: 'absolute',
    alignItems: 'center',
    width: PIP_WIDTH,
  },
  tapHintText: {
    color: C.WHITE,
    fontSize: FONT.SIZES.XS,
    fontFamily: FONT.BODY_SEMIBOLD,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: SPACE.SM,
    paddingVertical: SPACE.XS,
    borderRadius: RADIUS.FULL,
    overflow: 'hidden',
  },
  tapHintArrow: {
    color: C.WHITE,
    fontSize: 20,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

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

  emojiDrawer: { position: 'absolute', alignItems: 'center', gap: SPACE.SM },
  emojiList: { alignItems: 'center', gap: SPACE.SM, marginBottom: SPACE.SM },
  emojiToggle: {
    width: 44, height: 44, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  emojiToggleOpen: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  emojiToggleIcon: { fontSize: 22 },
  emojiBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: RADIUS.FULL,
    width: 52, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 2,
  },
  emojiBtnActive: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'transparent' },
  emojiGlyph: { fontSize: 24 },
  emojiCount: { color: 'rgba(255,255,255,0.6)', fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY },
  emojiCountActive: { color: C.WHITE, fontFamily: FONT.BODY_BOLD },

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
