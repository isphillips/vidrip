import { log } from '../../../infrastructure/logging/logger';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import TikTokPlayer, { type TikTokPlayerHandle } from '../../../components/TikTokPlayer';
import { WebView } from 'react-native-webview';
import {
  View,
  Text,
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
  withTiming,
  interpolate,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

// Height of the source player when shrunk into the corner (screen-aspect mini).
const PIP_H = 184;
import Video from 'react-native-video';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { configureForMixedPlayback } from '../../../infrastructure/native/audioRecorder';
import { shareTextNative } from '../../../infrastructure/share/nativeShare';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { IG_BLOCK_LAUNCH_JS } from '../../shared/igBlockLaunch';
import { igReelJs } from '../../shared/igReelPlayer';
import { supabase } from '../../../infrastructure/supabase/client';
import { fetchReactionById, fetchReactions, type ReactionItem } from '../../../infrastructure/supabase/queries/threads';
import { downloadAndCache, recordReactionDownload } from '../../../infrastructure/storage/reactionStorage';
import {
  fetchEmojiReactions,
  addEmojiReaction,
  removeEmojiReaction,
  type EmojiReaction,
} from '../../../infrastructure/supabase/queries/reactions';
import { useAuthStore } from '../../../store/authStore';
import { useIntroSeenStore } from '../../../store/introSeenStore';
import IntroPreroll from '../components/IntroPreroll';
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
  // Intro pre-roll: play the sender's intro once per thread per viewing session.
  const introSeen = useIntroSeenStore(s => s.seen);
  const markIntroSeen = useIntroSeenStore(s => s.markSeen);
  const { width, height } = useWindowDimensions();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();

  const [reaction, setReaction] = useState<ReactionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const [downloadPct, setDownloadPct] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);
  // When the main reaction ends and it has an afterthought outro, we swap the player to it
  // before auto-advancing.
  const [playingAfterthought, setPlayingAfterthought] = useState(false);
  const [srcDismissed, setSrcDismissed] = useState(false);
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
  const ttRef = useRef<TikTokPlayerHandle>(null);
  // True while force-stopping at the end — ignore the source's auto "playing"
  // (seekTo resumes YouTube, which would otherwise loop the source).
  const stoppingRef = useRef(false);
  // Defer the YouTube rewind until it reports 'paused', so seekTo doesn't resume it.
  const pendingYtSeekRef = useRef(false);
  // Ordered ids of this thread's reactions — drives auto-advance on end.
  const siblingIdsRef = useRef<string[]>([]);
  // Latest reaction playhead (seconds) — read by the source-sync loop without re-running it.
  const progressRef = useRef(0);

  // Load reaction + emoji reactions
  useEffect(() => {
    fetchReactionById(reactionId)
      .then(async (r) => {
        if (!r) { setDownloadState('unavailable'); setLoading(false); return; }
        setReaction(r);
        fetchEmojiReactions(r.id).then(setEmojiReactions).catch(() => {});
        if (r.thread_id) {
          fetchReactions(r.thread_id)
            .then(list => { siblingIdsRef.current = list.map(x => x.id); })
            .catch(() => {});
        }

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

  // Safety net: a bad/inaccessible link or a stalled network must resolve to
  // "Not available" rather than spinning forever. Cleared as soon as load finishes.
  useEffect(() => {
    if (!loading) { return; }
    const t = setTimeout(() => {
      setDownloadState(s => (s === 'idle' ? 'unavailable' : s));
      setLoading(false);
    }, 15000);
    return () => clearTimeout(t);
  }, [loading]);

  // Realtime emoji updates
  useEffect(() => {
    const channel = (supabase as any)
      .channel(`emoji:${reactionId}:${Date.now()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'emoji_reactions',
        filter: `reaction_id=eq.${reactionId}`,
      }, () => {
        fetchEmojiReactions(reactionId).then(setEmojiReactions).catch(() => {});
      })
      .subscribe();
    // removeChannel (not unsubscribe) so re-opening the same reaction doesn't reuse
    // a stale, already-subscribed channel → "cannot add postgres_changes callbacks".
    return () => { (supabase as any).removeChannel(channel); };
  }, [reactionId]);

  const handlePlayPause = useCallback(() => {
    setPaused(prev => {
      if (prev) { setHasStarted(true); }
      return !prev;
    });
  }, []);

  const handleYtStateChange = useCallback((state: string) => {
    if (state === 'playing') {
      if (stoppingRef.current) { return; }   // stray resume during stop → ignore
      setPaused(false);
      setHasStarted(true);
    } else if (state === 'paused') {
      setPaused(true);
      // Now that it's confirmed paused, rewind to 0 — seekTo keeps a paused player
      // paused (it would resume a playing one, which caused the loop).
      if (pendingYtSeekRef.current) {
        pendingYtSeekRef.current = false;
        ytRef.current?.seekTo?.(0, true);
        setTimeout(() => { stoppingRef.current = false; }, 300);
      }
    }
    // If the SOURCE ends first (short clips), do nothing: the reaction video keeps
    // playing and its own onEnd drives auto-advance. Rewinding it here would loop the
    // reaction so onEnd never fires (the auto-jump regression).
  }, []);

  // TikTok has no `play` prop (unlike YoutubePlayer), so push our paused state in.
  useEffect(() => {
    if (reaction?.source_type !== 'tiktok') { return; }
    if (paused) { ttRef.current?.pause(); } else { ttRef.current?.play(); }
  }, [paused, reaction?.source_type]);

  // Keep the YouTube source locked to the reaction clock. The recording is a fixed
  // clip where reaction time t ↔ source time (offset + t); without correction the two
  // start misaligned (YouTube load latency) and drift apart over the clip. The reaction
  // video is the master; nudge YouTube back only on meaningful drift to avoid constant
  // seeks. (TikTok exposes no current-time, so it can't be corrected this way.)
  useEffect(() => {
    if (paused || reaction?.source_type !== 'youtube' || !reaction?.yt_video_id) { return; }
    const offset = reaction.yt_start_offset ?? 0;
    const id = setInterval(async () => {
      if (stoppingRef.current) { return; }
      try {
        const ytTime = await ytRef.current?.getCurrentTime?.();
        if (typeof ytTime !== 'number') { return; }
        const target = offset + progressRef.current;
        if (Math.abs(ytTime - target) > 0.5) { ytRef.current?.seekTo?.(target, true); }
      } catch { /* player not ready */ }
    }, 1200);
    return () => clearInterval(id);
  }, [paused, reaction?.source_type, reaction?.yt_video_id, reaction?.yt_start_offset]);

  // Source player: full-screen until playback starts, then shrinks to the corner
  // (uniform scale of the whole screen, no distortion) revealing the reaction.
  const pip = useSharedValue(0);
  useEffect(() => {
    pip.value = withTiming(hasStarted ? 1 : 0, { duration: 650, easing: Easing.inOut(Easing.cubic) });
  }, [hasStarted, pip]);
  // Slides the pip off-screen to the right when the afterthought takes over.
  const slideOff = useSharedValue(0);
  useEffect(() => {
    if (!playingAfterthought) { return; }
    slideOff.value = withTiming(1, { duration: 320, easing: Easing.inOut(Easing.cubic) }, () => {
      runOnJS(setSrcDismissed)(true);
    });
  }, [playingAfterthought, slideOff]);
  const srcStyle = useAnimatedStyle(() => {
    const sFinal = PIP_H / height;
    const s = interpolate(pip.value, [0, 1], [1, sFinal]);
    const tx = interpolate(pip.value, [0, 1], [0, (width * (1 - sFinal)) / 2 - SPACE.LG]);
    const ty = interpolate(pip.value, [0, 1], [0, (height * (1 - sFinal)) / 2 - (bottomInset + 100)]);
    const slideX = interpolate(slideOff.value, [0, 1], [0, width * 2]);
    return { transform: [{ translateX: tx + slideX }, { translateY: ty }, { scale: s }] };
  });
  const ytCoverW = Math.round(height * (16 / 9));
  const ytOffsetX = -Math.round((ytCoverW - width) / 2);

  const handleEnd = useCallback(() => {
    stoppingRef.current = true;
    // If the reaction has an afterthought outro and we haven't played it yet, swap the player
    // to it before advancing. Crucially: don't touch paused here — leaving it false means the
    // Video component seamlessly switches to afterthoughtUri without triggering the TikTok
    // useEffect (paused→true→false) that would re-start the source player.
    if (!playingAfterthought && reaction?.afterthoughtUri) {
      setPlayingAfterthought(true);
      stoppingRef.current = false;
      progressRef.current = 0;
      setProgress(0);
      return;
    }
    // Halt the source now that we're done (no afterthought, or afterthought just finished).
    setPaused(true);
    ttRef.current?.pause();
    // Auto-advance to the next reaction in the thread; if this is the last one,
    // dismiss back to the thread (card-style pop).
    const ids = siblingIdsRef.current;
    const idx = ids.indexOf(reactionId);
    const nextId = idx >= 0 ? ids[idx + 1] : undefined;
    if (nextId) {
      navigation.replace('WatchReaction', { reactionId: nextId });
    } else {
      navigation.goBack();
    }
  }, [reactionId, navigation, playingAfterthought, reaction?.afterthoughtUri]);

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
      log.error('[handleEmojiPress] error:', String(e));
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

  // Sender intro plays once per thread per session, before the reaction is shown.
  if (reaction?.intro_url && reaction.thread_id && !introSeen.has(reaction.thread_id)) {
    return (
      <IntroPreroll
        introUrl={reaction.intro_url}
        onDone={() => markIntroSeen(reaction.thread_id!)}
      />
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
          source={{ uri: (playingAfterthought && reaction?.afterthoughtUri) ? reaction.afterthoughtUri : localUri }}
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
          onProgress={(d: any) => { progressRef.current = d.currentTime; setProgress(d.currentTime); }}
          onEnd={handleEnd}
          onError={(e: any) => log.error('[WatchReaction] error:', JSON.stringify(e))}
          repeat={false}
        />
      </View>

      {/* Tap-to-play background — only when there's NO source PIP (or Instagram, which
          can't drive the reaction via embed events so the user taps to play directly). */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={reaction?.yt_video_id && reaction.source_type !== 'instagram' ? undefined : handlePlayPause}
      />

      {/* Play icon — when tap-to-play is active. */}
      {paused && (!reaction?.yt_video_id || reaction.source_type === 'instagram') && (
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
            {reaction?.yt_video_id && reaction.source_type !== 'instagram' ? 'Tap ▶ on the video to start' : 'Tap to play reaction'}
          </Text>
        </View>
      )}

      {/* Source player — full-screen, then animates into the corner on play. Hidden once the
          afterthought outro takes over (the reaction is finished). */}
      {sessionReady && reaction?.yt_video_id && !srcDismissed && (
        <Animated.View style={[StyleSheet.absoluteFill, srcStyle]}>
          {reaction.source_type === 'instagram' ? (
            <WebView
              style={{ width, height, backgroundColor: '#000' }}
              source={{ uri: `https://www.instagram.com/reel/${reaction.yt_video_id}/?l=1` }}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo={false}
              javaScriptEnabled
              // Match the full-screen ?l=1 look used while recording. The native
              // react-native-webview patch + this in-page blocker keep the reel page from
              // deep-linking into the IG app. See igBlockLaunch / the IG_BLOCK_LAUNCH_JS docs.
              setSupportMultipleWindows={false}
              onShouldStartLoadWithRequest={req => req.url.startsWith('https://') || req.url.startsWith('about:')}
              injectedJavaScriptBeforeContentLoaded={IG_BLOCK_LAUNCH_JS}
              // Mute the reel unless the reaction was recorded with headphones — matches the
              // muted YouTube/TikTok source so the reactor's mic is heard (an unmuted reel
              // steals audio focus on Android and drowns out the mic).
              injectedJavaScript={igReelJs(!reaction.recorded_with_headphones)}
              onMessage={(e) => {
                try {
                  const msg = JSON.parse(e.nativeEvent.data);
                  // Ignore 'paused' — fires during buffering; only 'playing' drives the reaction start.
                  if (msg.type && msg.type !== 'paused') { handleYtStateChange(msg.type); }
                } catch { /* ignore */ }
              }}
            />
          ) : reaction.source_type === 'tiktok' ? (
            <TikTokPlayer
              ref={ttRef}
              startMuted={!reaction.recorded_with_headphones}
              style={{ width, height, backgroundColor: '#000' }}
              videoId={reaction.yt_video_id}
              onChangeState={handleYtStateChange}
              onReady={() => {
                const offset = reaction.yt_start_offset ?? 0;
                if (offset > 0) { ttRef.current?.seekTo(offset); }
              }}
            />
          ) : (
            <View style={{ width, height, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', left: ytOffsetX }}>
                <YoutubePlayer
                  ref={ytRef}
                  height={height}
                  width={ytCoverW}
                  videoId={reaction.yt_video_id}
                  mute={!reaction.recorded_with_headphones}
                  play={Platform.OS === 'ios' ? !paused : undefined}
                  onChangeState={handleYtStateChange}
                  initialPlayerParams={{ controls: true, rel: false } as any}
                  webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
                  onReady={() => {
                    const offset = reaction.yt_start_offset ?? 0;
                    if (offset > 0) { ytRef.current?.seekTo(offset, true); }
                  }}
                  webViewStyle={{ backgroundColor: '#000' }}
                />
              </View>
            </View>
          )}
        </Animated.View>
      )}

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

      {/* Share this reaction as a Vidrip deep link (opens it for thread members) */}
      <TouchableOpacity
        style={[styles.shareBtn, { top: topInset + SPACE.SM }]}
        onPress={() => shareTextNative('Watch my reaction on Vidrip', `reaxn://reaction/${reactionId}`)}>
        <Ionicons name="share-outline" size={20} color={C.WHITE} />
      </TouchableOpacity>

      {/* Close */}
      <TouchableOpacity
        style={[styles.closeBtn, { top: topInset + SPACE.SM }]}
        onPress={() => navigation.goBack()}>
        <Text style={styles.closeTxt}>✕</Text>
      </TouchableOpacity>

      {/* DEV: trigger the dock animation when the source won't play (e.g. TikTok in sim) */}
      {__DEV__ && reaction?.yt_video_id && (
        <TouchableOpacity
          style={[styles.devDock, { top: topInset + SPACE.SM }]}
          onPress={() => { setHasStarted(s => !s); setPaused(false); }}>
          <Text style={styles.devDockTxt}>{hasStarted ? 'undock' : 'dock'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BLACK },
  devDock: {
    position: 'absolute', left: SPACE.LG,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: RADIUS.FULL,
    paddingHorizontal: SPACE.MD, paddingVertical: 6,
  },
  devDockTxt: { color: C.WHITE, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_BOLD },
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
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'column', alignItems: 'center', gap: 2,
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
  shareBtn: {
    position: 'absolute', right: SPACE.LG + 44,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  shareTxt: { color: C.WHITE, fontSize: 18, fontFamily: FONT.BODY_BOLD, lineHeight: 20 },
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
