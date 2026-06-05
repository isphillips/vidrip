import React, { useCallback, useEffect, useRef, useState } from 'react';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import Video from 'react-native-video';
import { configureForMixedPlayback } from '../../../infrastructure/native/audioRecorder';
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

import EmojiGlyph, { QUICK_EMOJIS } from '../../../components/EmojiGlyph';
const MAX_EMOJIS_PER_USER = 10;
type DownloadState = 'idle' | 'downloading' | 'ready' | 'unavailable';

// ── Animated emoji button ────────────────────────────────────────────────────
function EmojiBtn({
  emoji, count, isMine, isDisabled,
  onPress,
}: {
  emoji: string;
  count: number;
  isMine: boolean;
  isDisabled: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(1.28, { damping: 5, stiffness: 600 }),
      withSpring(1,    { damping: 14, stiffness: 400 }),
    );
    onPress();
  };

  // Pressable has no built-in opacity change, so the Reanimated scale is the
  // only feedback — TouchableOpacity's activeOpacity was fighting the animation.
  return (
    <Pressable onPress={handlePress} disabled={isDisabled}>
      <Animated.View style={[styles.emojiBtn, isMine && styles.emojiBtnActive, animStyle]}>
        <EmojiGlyph emoji={emoji} size={24} />
        {count > 0 && (
          <Text style={[styles.emojiCount, isMine && styles.emojiCountActive]}>
            {count}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function WatchReactionScreen({
  route, navigation,
}: FeedStackScreenProps<'WatchReaction'>) {
  const { reactionId } = route.params;
  const { user } = useAuthStore();
  const { width, height } = useWindowDimensions();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();

  const [reaction, setReaction] = useState<ReactionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const [downloadPct, setDownloadPct] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [emojiReactions, setEmojiReactions] = useState<EmojiReaction[]>([]);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
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

  const handlePlayPause = useCallback(() => {
    setPaused(prev => {
      if (prev) { setHasStarted(true); }
      return !prev;
    });
  }, []);

  const handleYtStateChange = useCallback((state: string) => {
    if (state === 'playing') {
      setPaused(false);
      setHasStarted(true);
    } else if (state === 'paused') {
      setPaused(true);
    } else if (state === 'ended') {
      setPaused(true); setProgress(0); videoRef.current?.seek(0);
    }
  }, [videoRef]);

  const handleEnd = useCallback(() => {
    setPaused(true);
    setProgress(0);
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
        // Remove by natural key — avoids stale id issues
        setEmojiReactions(prev =>
          prev.filter(r => !(r.emoji === emoji && r.user_id === user.id))
        );
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

  // ── Loading states ──────────────────────────────────────────────────────
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

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill}>
        <Video
          ref={videoRef}
          source={{ uri: localUri }}
          style={{ width, height }}
          resizeMode="cover"
          paused={paused}
          mixWithOthers="mix"
          disableFocus={Platform.OS === 'android'}
          onLoad={(d: any) => {
            setDuration(d.duration);
            configureForMixedPlayback()
              .then(() => setSessionReady(true))
              .catch(() => setSessionReady(true));
          }}
          onProgress={(d: any) => setProgress(d.currentTime)}
          onEnd={handleEnd}
          onError={(e: any) => console.error('[WatchReaction] error:', JSON.stringify(e))}
          repeat={false}
        />
      </View>

      {/* Tap-to-play background — disabled on Android when YouTube controls playback */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={Platform.OS === 'android' && reaction?.yt_video_id ? undefined : handlePlayPause}
      />

      {/* Play icon — shown when paused and tap-to-play is active */}
      {paused && !(Platform.OS === 'android' && reaction?.yt_video_id) && (
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playCircle}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>
      )}

      {/* Prompt overlay — shown before first play */}
      {!hasStarted && (
        <View style={styles.startPrompt} pointerEvents="none">
          <Text style={styles.startPromptText}>
            {Platform.OS === 'android' && reaction?.yt_video_id
              ? 'Tap ▶ on the YouTube video to start'
              : reaction?.yt_video_id ? 'Tap ▶ to play reaction' : 'Tap to play reaction'}
          </Text>
        </View>
      )}

      {/* YouTube PIP — vertical cover fill */}
      {sessionReady && reaction?.yt_video_id && (() => {
        const pipH = styles.ytPip.height;
        const pipW = styles.ytPip.width;
        const coverW = Math.round(pipH * (16 / 9));
        const offsetX = -Math.round((coverW - pipW) / 2);
        return (
          <View style={[styles.ytPip, { bottom: bottomInset + 100, right: SPACE.LG }]}>
            <View style={[styles.ytPipInner, { left: offsetX }]}>
              <YoutubePlayer
                ref={ytRef}
                height={pipH}
                width={coverW}
                videoId={reaction.yt_video_id}
                play={Platform.OS === 'ios' ? !paused : undefined}
                onChangeState={handleYtStateChange}
                initialPlayerParams={{ controls: true, rel: false, mute: 1 } as any}
                webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
                onReady={() => {
                  const offset = reaction.yt_start_offset ?? 0;
                  if (offset > 0) { ytRef.current?.seekTo(offset, true); }
                }}
                webViewStyle={{ backgroundColor: '#000' }}
              />
            </View>
          </View>
        );
      })()}

      {/* Handle + timer */}
      <View style={[styles.infoBar, { top: topInset + SPACE.SM }]} pointerEvents="none">
        <Text style={styles.handle}>@{handle}</Text>
        <Text style={styles.timer}>{fmt(progress)} / {fmt(totalDuration)}</Text>
      </View>

      {/* Emoji drawer — right side, collapses into toggle button */}
      <View style={[styles.emojiDrawer, { right: SPACE.MD, bottom: bottomInset + SPACE.LG }]}>
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

        {/* Toggle button */}
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
    position: 'absolute', left: SPACE.LG, right: 60,
    flexDirection: 'column', alignItems: 'flex-start', gap: 2,
  },
  handle: {
    color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  timer: {
    color: 'rgba(255,255,255,0.8)', fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  emojiDrawer: {
    position: 'absolute',
    alignItems: 'center',
    gap: SPACE.SM,
  },
  emojiList: {
    alignItems: 'center',
    gap: SPACE.SM,
    marginBottom: SPACE.SM,
  },
  emojiToggle: {
    width: 44, height: 44,
    borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiToggleOpen: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  emojiToggleIcon: { fontSize: 22 },
  emojiBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: RADIUS.FULL,
    width: 52, paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 2,
  },
  emojiBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'transparent',
  },
  emojiGlyph: { fontSize: 24 },
  emojiCount: { color: 'rgba(255,255,255,0.6)', fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY },
  emojiCountActive: { color: C.WHITE, fontFamily: FONT.BODY_BOLD },
  ytPip: {
    position: 'absolute',
    width: 90, height: 160,
    borderRadius: RADIUS.MD, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
  },
  ytPipInner: { position: 'absolute' },
  ytPipOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  ytPipPlay: { color: C.WHITE, fontSize: 18 },
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
  startPrompt: {
    position: 'absolute', bottom: 0, left: 0, right: 0, top: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  startPromptText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: FONT.SIZES.MD,
    fontFamily: FONT.BODY_MEDIUM,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: SPACE.LG,
    paddingVertical: SPACE.SM,
    borderRadius: RADIUS.MD,
    overflow: 'hidden',
    textAlign: 'center',
  },
});
