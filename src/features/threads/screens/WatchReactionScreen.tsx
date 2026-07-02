import { log } from '../../../infrastructure/logging/logger';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import TikTokPlayer, { type TikTokPlayerHandle } from '../../../components/TikTokPlayer';
import InstagramPlayer, { type InstagramPlayerHandle } from '../../../components/InstagramPlayer';
import { WebView } from 'react-native-webview';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Platform,
  ScrollView,
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
import Video, { ViewType } from 'react-native-video';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ContentActions from '../../../components/ContentActions';
import { configureForMixedPlayback } from '../../../infrastructure/native/audioRecorder';
import { shareTextNative } from '../../../infrastructure/share/nativeShare';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { IG_BLOCK_LAUNCH_JS } from '../../shared/igBlockLaunch';
import { igReelJs } from '../../shared/igReelPlayer';
import { supabase } from '../../../infrastructure/supabase/client';
import { fetchReactionById, fetchReactions, fetchReactionEmojiTrack, type ReactionItem } from '../../../infrastructure/supabase/queries/threads';
import EmojiFountain, { type EmojiFountainHandle, type EmojiHit } from '../../../components/EmojiFountain';
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

// IG PHOTO post: no video to tap-to-play, so the reaction is driven by tapping the post. A native
// overlay Pressable would work on iOS, but Android WebViews eat the FIRST tap focusing themselves, so
// it'd need two taps. Instead a document-level `touchend` inside the page (touch isn't focus-gated the
// way `click` is — see the recorder's YT_TAP_TO_PLAY) posts a 'tap' that drives play/pause on the first
// touch, on both platforms. Also keeps the page black so letterboxing reads black.
const IG_PHOTO_TAP_JS = `(function(){
  function imp(el,k,v){ if(el&&el.style){ el.style.setProperty(k,v,'important'); } }
  function paint(){ imp(document.documentElement,'background-color','#000'); if(document.body){ imp(document.body,'background-color','#000'); } }
  function post(){ try{ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify({type:'tap'})); } }catch(e){} }
  document.addEventListener('touchend', post, true);
  document.addEventListener('click', post, true);
  paint();
  var n=0, iv=setInterval(function(){ n++; paint(); if(n>60){ clearInterval(iv); } }, 100);
})(); true;`;
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
  const [burstK, setBurstK] = useState(0);

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(1.28, { damping: 5, stiffness: 600 }),
      withSpring(1,    { damping: 14, stiffness: 400 }),
    );
    setBurstK(k => k + 1); // play the blob's expressive burst
    onPress();
  };

  // Pressable has no built-in opacity change, so the Reanimated scale is the
  // only feedback — TouchableOpacity's activeOpacity was fighting the animation.
  return (
    <Pressable onPress={handlePress} disabled={isDisabled}>
      <Animated.View style={[styles.emojiBtn, isMine && styles.emojiBtnActive, animStyle]}>
        <EmojiGlyph emoji={emoji} size={24} excited={burstK} />
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
  // Studio-share source: the sender's clip (a sibling reaction). Resolved playable URI for its PIP.
  const [studioSourceUri, setStudioSourceUri] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [emojiReactions, setEmojiReactions] = useState<EmojiReaction[]>([]);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  // Android ExoPlayer drops a play command (paused→false) if it arrives before the player has
  // prepared/attached its surface — so an early tap does nothing and the user taps again. Gate the
  // reaction video's `paused` on this flag (set once the first frame is ready) so the play intent is
  // only delivered to a ready player. iOS already starts reliably; the gate is a harmless no-op there.
  const [canPlay, setCanPlay] = useState(false);
  // The source player has reported ready (YouTube/TikTok/studio onReady, FB 'ready', IG page load) — or
  // there's no source to wait for. Paired with `canPlay` (reaction first frame) to hold a single load
  // spinner until BOTH are ready, so the reaction and source never appear one-loading-over-the-other.
  const [sourceReady, setSourceReady] = useState(false);
  // Instagram post-type: an IG share is either a video REEL (a controllable embed, like YouTube) or a
  // photo POST (no playable video — show the still image as the source). null = still detecting via the
  // OG scrape (which also yields the photo's image url). Mirrors the recorder's igIsVideo detection.
  const [igIsVideo, setIgIsVideo] = useState<boolean | null>(null);
  const videoRef = useRef<any>(null);
  const ytRef = useRef<YoutubeIframeRef>(null);
  const ttRef = useRef<TikTokPlayerHandle>(null);
  const igRef = useRef<InstagramPlayerHandle>(null);   // studio file-source PIP
  const igReelRef = useRef<any>(null);                  // IG reel WebView — driven via injectJavaScript to sync with the reaction
  const igTimeRef = useRef(0);                          // latest studio-source playhead (onCurrentTime)
  const fbWebRef = useRef<any>(null);                   // FB SDK player WebView — driven via injectJavaScript
  // True while force-stopping at the end — ignore the source's auto "playing"
  // (seekTo resumes YouTube, which would otherwise loop the source).
  const stoppingRef = useRef(false);
  // Defer the YouTube rewind until it reports 'paused', so seekTo doesn't resume it.
  const pendingYtSeekRef = useRef(false);
  // Ordered ids of this thread's reactions — drives auto-advance on end.
  const siblingIdsRef = useRef<string[]>([]);
  // Latest reaction playhead (seconds) — read by the source-sync loop without re-running it.
  const progressRef = useRef(0);
  // Replay of the reactor's emoji throws ({e,t}[]), re-emitted as playback crosses each t.
  const fountainRef = useRef<EmojiFountainHandle>(null);
  const emojiTrackRef = useRef<EmojiHit[]>([]);
  const firedRef = useRef(0);          // index into the sorted track of the next throw to fire
  const lastReplayTimeRef = useRef(0); // detect loop/seek-back to re-arm

  // Re-emit throws whose timestamp playback has reached; re-arm when the clip loops/seeks back.
  const replayEmojis = useCallback((t: number) => {
    const track = emojiTrackRef.current;
    if (track.length === 0) { return; }
    if (t + 0.25 < lastReplayTimeRef.current) { firedRef.current = 0; }
    lastReplayTimeRef.current = t;
    while (firedRef.current < track.length && track[firedRef.current].t <= t) {
      fountainRef.current?.emit(track[firedRef.current].e);
      firedRef.current += 1;
    }
  }, []);

  // Load reaction + emoji reactions
  useEffect(() => {
    fetchReactionById(reactionId)
      .then(async (r) => {
        if (!r) { setDownloadState('unavailable'); setLoading(false); return; }
        setReaction(r);
        fetchEmojiReactions(r.id).then(setEmojiReactions).catch(() => {});
        fetchReactionEmojiTrack(r.id)
          .then(t => { emojiTrackRef.current = [...t].sort((a, b) => a.t - b.t); firedRef.current = 0; lastReplayTimeRef.current = 0; })
          .catch(() => {});
        if (r.thread_id) {
          fetchReactions(r.thread_id)
            .then(list => {
              siblingIdsRef.current = list.map(x => x.id);
              // Studio share: the source clip has no external embed — it's the thread SENDER's own
              // reaction row. Detect it structurally (no yt id, not a real external source) so it works
              // even when `threadKind` is unavailable: `fetchReactionById` reads threadKind/senderId from
              // a thread join that's RLS-blocked for the SENDER (who isn't a member of their own thread),
              // so when the creator watches a friend react to their own clip both come back null.
              const noEmbed = !r.yt_video_id
                && r.source_type !== 'tiktok' && r.source_type !== 'instagram' && r.source_type !== 'facebook';
              if (r.threadKind === 'studio_share' || noEmbed) {
                // The clip is by the thread sender. Members get senderId from the join; when it's null
                // (the sender's own RLS-blocked view) the sender IS the viewer, so fall back to our id.
                const senderId = r.senderId ?? user?.id ?? null;
                const clip = senderId
                  ? list.find(x => x.id !== r.id && x.user?.id === senderId)
                  : null;
                if (clip?.resolvedUri) { setStudioSourceUri(clip.resolvedUri); }
                else { setSourceReady(true); }   // studio share but no locatable clip → no source to wait on
              }
            })
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

  // Safety net for the both-ready load gate: if a source never reports ready (e.g. an IG reel has no
  // ready event, or the sibling fetch failed), reveal anyway after a few seconds rather than spin forever.
  useEffect(() => {
    if (loading || sourceReady) { return; }
    const t = setTimeout(() => setSourceReady(true), 8000);
    return () => clearTimeout(t);
  }, [loading, sourceReady]);

  // Instagram: detect reel vs photo post via the OG scrape (same as the recorder). A photo has no video,
  // so we render its still image as the source; the scrape also returns that image url. Default to reel
  // when unknown/failed (the common case), matching the recorder.
  useEffect(() => {
    if (reaction?.source_type !== 'instagram' || !reaction.yt_video_id) { return; }
    let alive = true;
    supabase.functions
      .invoke('instagram-oembed', { body: { url: `https://www.instagram.com/p/${reaction.yt_video_id}/` } })
      .then(({ data }: any) => {
        if (!alive) { return; }
        const isVid = data?.isVideo !== false;
        setIgIsVideo(isVid);
        if (!isVid) {
          // A photo has no video to load — mark the source ready NOW so the load gate lifts on the
          // reaction alone; the IG post page fills into its WebView behind it (may be slow / black
          // first). Don't block playback on the embed.
          setSourceReady(true);
        }
      })
      .catch((e) => { if (alive) { setIgIsVideo(true); } });
    return () => { alive = false; };
  }, [reaction?.source_type, reaction?.yt_video_id]);

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

  // Restart from the top (like the recorder's ↺): rewind the reaction AND every possible source to the
  // start, re-arm the emoji replay, drop out of the afterthought outro, and play. Seeks are fired on all
  // player refs unconditionally — inactive ones are null and no-op.
  const handleRestart = useCallback(() => {
    const offset = reaction?.yt_start_offset ?? 0;
    stoppingRef.current = false;
    pendingYtSeekRef.current = false;
    setPlayingAfterthought(false);
    progressRef.current = 0;
    setProgress(0);
    firedRef.current = 0;
    lastReplayTimeRef.current = 0;
    videoRef.current?.seek?.(0);
    ytRef.current?.seekTo?.(offset, true);
    ttRef.current?.seekTo?.(offset);
    igRef.current?.seekTo?.(0);
    // IG reel: no player handle — rewind + replay its <video> via injected JS (its layer is already
    // composited from the initial tap, so play() is safe here).
    igReelRef.current?.injectJavaScript?.('(function(){var v=document.querySelector("video");if(v){try{v.currentTime=0;var p=v.play();if(p&&p.catch){p.catch(function(){});}}catch(e){}}})();true;');
    fbWebRef.current?.injectJavaScript?.('window.fbPlayer&&window.fbPlayer.seek(0);true;');
    setHasStarted(true);
    setPaused(false);
  }, [reaction?.yt_start_offset]);

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

  // Facebook: the SDK player reports its own start ('startedPlaying' → handleYtStateChange), but from
  // then on the reaction is the master — mirror our paused state onto the FB player via injectJavaScript
  // so pausing the reaction pauses FB too (window.fbPlayer is captured on xfbml.ready in the embed HTML).
  useEffect(() => {
    if (reaction?.source_type !== 'facebook' || !hasStarted) { return; }
    fbWebRef.current?.injectJavaScript(`window.fbPlayer&&window.fbPlayer.${paused ? 'pause' : 'play'}();true;`);
  }, [paused, hasStarted, reaction?.source_type]);

  // Instagram: after the reel has been started by a real tap (its GPU layer is composited), mirror our
  // paused state onto it via injectJavaScript — so pausing/resuming the reaction pauses/resumes the reel
  // in sync, the same way the YouTube source follows the reaction. Only after hasStarted so the initial
  // touch (which composites + starts the reel, avoiding the WKWebView black-layer bug) isn't fought.
  useEffect(() => {
    if (reaction?.source_type !== 'instagram' || igIsVideo === false || !hasStarted) { return; }
    igReelRef.current?.injectJavaScript?.(
      `(function(){var v=document.querySelector('video');if(v){try{${paused ? 'v.pause()' : 'v.play()'};}catch(e){}}})();true;`,
    );
  }, [paused, hasStarted, reaction?.source_type, igIsVideo]);

  // Studio source: a re-hosted file PIP driven imperatively (no `play` prop). Mirror TikTok: push
  // the paused state in, and nudge it back onto the reaction clock on drift (it starts at offset 0).
  // `studioSourceUri` is set only for a studio_share (resolved from the sender's sibling clip), and the
  // reaction's own `source_type` is the coerced 'youtube' placeholder — so gate on the URI, not the type.
  useEffect(() => {
    if (!studioSourceUri) { return; }
    if (paused) { igRef.current?.pause(); } else { igRef.current?.play(); }
  }, [paused, studioSourceUri]);
  useEffect(() => {
    if (paused || !studioSourceUri) { return; }
    const id = setInterval(() => {
      const target = progressRef.current;
      if (Math.abs(igTimeRef.current - target) > 0.5) { igRef.current?.seekTo?.(target); }
    }, 1200);
    return () => clearInterval(id);
  }, [paused, studioSourceUri]);

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

  // Pin full-screen states to the WINDOW height, not the flex-filled card. This screen is immersive, so
  // the tab bar hides once the nav state reflects it — which lags the push transition a frame, briefly
  // resizing the card and making a `flex: 1` centered spinner jitter up/down. A fixed window height is
  // immune to that resize, so the loader stays put during the transition.
  const windowFill = { position: 'absolute' as const, top: 0, left: 0, right: 0, height };

  // ── Loading states ──────────────────────────────────────────────────────
  if (loading || downloadState === 'idle') {
    return <View style={[styles.center, windowFill]}><ActivityIndicator color={C.ACCENT} size="large" /></View>;
  }

  if (downloadState === 'downloading') {
    return (
      <View style={[styles.center, windowFill]}>
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
      <View style={[styles.center, windowFill]}>
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
  const reactorId = (reaction?.user as any)?.id ?? null;
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
          // Studio_share clip watched directly (no separate source PIP) IS the shared content, so show
          // its thread thumbnail as the poster until the first frame decodes (else it's black on load).
          poster={(reaction?.threadKind === 'studio_share' && !studioSourceUri && reaction?.threadThumbnail)
            ? { source: { uri: reaction.threadThumbnail }, resizeMode: 'cover' }
            : undefined}
          paused={paused || !canPlay}
          // No-headphones recordings captured speaker bleed → mute the clip and let the clean
          // sync-locked source carry audio. NEVER mute the afterthought outro (voice-only, no
          // source behind it), or it'd be silent.
          muted={!reaction?.recorded_with_headphones && !playingAfterthought}
          mixWithOthers="mix"
          disableFocus={Platform.OS === 'android'}
          // TextureView renders in the normal view hierarchy so it can't be
          // blacked-out by window-focus changes (e.g. a Facebook overlay briefly
          // taking the foreground). SurfaceView (the default) renders on its own
          // hardware layer and goes black whenever another window steals focus.
          viewType={Platform.OS === 'android' ? ViewType.TEXTURE : undefined}
          onLoad={(d: any) => {
            setDuration(d.duration);
            setCanPlay(true); // fallback in case onReadyForDisplay doesn't fire
            configureForMixedPlayback()
              .then(() => setSessionReady(true))
              .catch(() => setSessionReady(true));
          }}
          // Android: the surface/first frame is ready — now a play command will actually take.
          onReadyForDisplay={() => setCanPlay(true)}
          onProgress={(d: any) => { progressRef.current = d.currentTime; setProgress(d.currentTime); replayEmojis(d.currentTime); }}
          onEnd={handleEnd}
          onError={(e: any) => {
            log.error('[WatchReaction] error:', JSON.stringify(e));
            setDownloadState('unavailable');
          }}
          repeat={false}
        />
      </View>

      {/* Tap-to-play background — active for sources that can't be paused via their own embed chrome:
          Instagram, TikTok, and sourceless reactions all toggle play/pause on a main-area tap (the paused
          state is mirrored onto the source by the per-source sync effects). Only YouTube stays hands-off
          (its embed has full native controls + the `play` prop sync). Facebook is special: the START must
          come ONLY from FB's play button ('startedPlaying'), so the background does nothing until the
          reaction has started — after which a main-area tap pauses/plays BOTH (via the FB sync). */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={
          reaction?.source_type === 'facebook'
            ? (hasStarted ? handlePlayPause : undefined)
            : (reaction?.yt_video_id && reaction.source_type !== 'instagram' && reaction.source_type !== 'tiktok' ? undefined : handlePlayPause)
        }
      />

      {/* Play icon — when tap-to-play is active. */}
      {paused && (!reaction?.yt_video_id || reaction.source_type === 'instagram' || reaction.source_type === 'facebook') && (
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
            {reaction?.yt_video_id && reaction.source_type !== 'instagram' && reaction.source_type !== 'facebook' ? 'Tap ▶ on the video to start' : 'Tap to play reaction'}
          </Text>
        </View>
      )}

      {/* Source player — full-screen, then animates into the corner on play. Hidden once the afterthought
          outro takes over. Facebook mounts WITHOUT waiting for sessionReady so its embed loads first
          (behind the black gate below) rather than appearing over an already-shown reaction video. */}
      {(sessionReady || reaction?.source_type === 'facebook') && !srcDismissed && !!reaction
        && (!!studioSourceUri || !!reaction.yt_video_id) && (
        <Animated.View style={[StyleSheet.absoluteFill, srcStyle]}>
          {studioSourceUri ? (
            <View style={{ width, height }}>
              {/* Studio clip = the sender's own reaction row; play it as a file PIP, synced to the reaction. */}
              <InstagramPlayer
                ref={igRef}
                uri={studioSourceUri}
                startMuted={false}
                poster={reaction?.threadThumbnail ?? undefined}
                style={{ width, height }}
                onReady={() => setSourceReady(true)}
                onCurrentTime={(t) => { igTimeRef.current = t; }}
              />
              {/* The full-screen source Video swallows taps before the corner-dock, so the background
                  play-Pressable never sees them — overlay one here so a tap starts/pauses (both sync). */}
              <Pressable style={StyleSheet.absoluteFill} onPress={handlePlayPause} />
            </View>
          ) : reaction.source_type === 'instagram' ? (
            igIsVideo === false ? (
              // IG PHOTO post — no playable video, so pull the ACTUAL post inline (like the recorder)
              // via the IG page, not just the OG thumbnail. A photo has no video to sync, and the tap
              // that drives play/pause comes from an in-page `touchend` (reliable first tap on Android —
              // see IG_PHOTO_TAP_JS) rather than a native overlay that Android would make you tap twice.
              <View style={{ width, height }}>
                <WebView
                  style={{ width, height, backgroundColor: '#000' }}
                  source={{ uri: `https://www.instagram.com/reel/${reaction.yt_video_id}/?l=1` }}
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  allowsFullscreenVideo={false}
                  javaScriptEnabled
                  setSupportMultipleWindows={false}
                  onShouldStartLoadWithRequest={req => req.url.startsWith('https://') || req.url.startsWith('about:')}
                  onLoadEnd={() => setSourceReady(true)}
                  injectedJavaScriptBeforeContentLoaded={IG_BLOCK_LAUNCH_JS}
                  injectedJavaScript={IG_PHOTO_TAP_JS}
                  onMessage={(e) => {
                    try {
                      const msg = JSON.parse(e.nativeEvent.data);
                      if (msg.type === 'tap') { handlePlayPause(); }
                    } catch { /* ignore */ }
                  }}
                />
              </View>
            ) : igIsVideo === true ? (
            <WebView
              ref={igReelRef}
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
              // No explicit 'ready' event from the reel — treat the page load as source-ready for the gate.
              onLoadEnd={() => setSourceReady(true)}
              injectedJavaScriptBeforeContentLoaded={IG_BLOCK_LAUNCH_JS}
              // Source always carries audio now (the clip is muted for no-headphones), so play
              // the reel rather than muting it.
              injectedJavaScript={igReelJs(false)}
              onMessage={(e) => {
                try {
                  const msg = JSON.parse(e.nativeEvent.data);
                  // IG drives the reaction like the YouTube embed — playing/paused/ended all flow through.
                  // Ignore ONLY the pre-start 'paused' (igReelJs's autoplay-then-pause dance before the
                  // first real tap); once started, an IG pause pauses the reaction in sync.
                  if (msg.type === 'paused' && !hasStarted) { return; }
                  if (msg.type) { handleYtStateChange(msg.type); }
                } catch { /* ignore */ }
              }}
            />
            ) : null   /* IG post-type still detecting — the load gate covers this */
          ) : reaction.source_type === 'facebook' ? (
            // Facebook JS SDK embed (NOT the uncontrollable plugins/video.php iframe): the player fires a
            // 'startedPlaying' event, which we postMessage out and feed into handleYtStateChange — so the
            // moment the user taps FB's play, the reaction starts at the same instant (start-aligned) and
            // this docks to the corner PIP, exactly like the Instagram path. appId-less: embedding a PUBLIC
            // video is a social plugin (no app review / Login / Graph scope). Source carries the audio.
            <View style={{ width, height }} pointerEvents={hasStarted ? 'none' : 'auto'}>
              {/* Before play the embed is interactive (tap FB's play → 'startedPlaying' starts the
                  reaction). Once started it's inert — all play/pause is driven from the reaction. */}
              <WebView
                ref={fbWebRef}
                style={{ width, height, backgroundColor: '#000' }}
                source={{
                  html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{background:#000;width:100vw;height:100vh;overflow:hidden}.fb-video{position:absolute!important;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important}</style></head><body><div id="fb-root"></div><div class="fb-video" data-href="${(reaction.yt_video_id as string).startsWith('http') ? (reaction.yt_video_id as string) : `https://www.facebook.com/reel/${reaction.yt_video_id}`}" data-width="${Math.round(width)}" data-show-text="false" data-autoplay="false" data-allowfullscreen="false"></div><script>function post(t){try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(t)}catch(e){}}window.fbAsyncInit=function(){FB.init({xfbml:true,version:'v21.0'});FB.Event.subscribe('xfbml.ready',function(m){if(m.type==='video'){window.fbPlayer=m.instance;post('ready');m.instance.subscribe('startedPlaying',function(){post('playing')})}})};(function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0];if(d.getElementById(id))return;js=d.createElement(s);js.id=id;js.src='https://connect.facebook.net/en_US/sdk.js';fjs.parentNode.insertBefore(js,fjs)}(document,'script','facebook-jssdk'));</script></body></html>`,
                  baseUrl: 'https://www.facebook.com',
                }}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                allowsFullscreenVideo={false}
                javaScriptEnabled
                domStorageEnabled
                setSupportMultipleWindows={false}
                onShouldStartLoadWithRequest={req => req.url.startsWith('https://') || req.url.startsWith('about:') || req.url.startsWith('data:')}
                onMessage={(e) => {
                  const d = e.nativeEvent.data;
                  if (d === 'ready') { setSourceReady(true); }
                  else if (d === 'playing') { handleYtStateChange('playing'); }
                }}
              />
            </View>
          ) : reaction.source_type === 'tiktok' ? (
            <TikTokPlayer
              ref={ttRef}
              // TikTok's mic-captured bleed is muffled/low-fi, so always play the CLEAN live source
              // (sync-locked to the clip) rather than muting it and leaving only the muffled bleed.
              startMuted={false}
              style={{ width, height, backgroundColor: '#000' }}
              videoId={reaction.yt_video_id as string}
              onChangeState={handleYtStateChange}
              onReady={() => {
                setSourceReady(true);
                const offset = reaction.yt_start_offset ?? 0;
                if (offset > 0) { ttRef.current?.seekTo(offset); }
              }}
            />
          ) : reaction.source_type === 'youtube' || !reaction.source_type ? (
            <View style={{ width, height, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', left: ytOffsetX }}>
                <YoutubePlayer
                  ref={ytRef}
                  height={height}
                  width={ytCoverW}
                  videoId={reaction.yt_video_id as string}
                  // Source always carries the audio now (the clip is muted for no-headphones). mute:1
                  // loads it muted, then this unmutes once it's playing.
                  mute={false}
                  play={Platform.OS === 'ios' ? !paused : undefined}
                  onChangeState={handleYtStateChange}
                  initialPlayerParams={{ controls: true, rel: false, mute: 1 } as any}
                  webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
                  onReady={() => {
                    setSourceReady(true);
                    const offset = reaction.yt_start_offset ?? 0;
                    if (offset > 0) { ytRef.current?.seekTo(offset, true); }
                  }}
                  webViewStyle={{ backgroundColor: '#000' }}
                />
              </View>
            </View>
          ) : null}
        </Animated.View>
      )}

      {/* Load gate: a black spinner over everything until BOTH the reaction (first frame) and the source
          are ready, then it lifts to reveal them stacked — so the reaction never flashes first with the
          source loading over it. A Pressable so it also absorbs taps (nothing can start before it lifts);
          the controls (close) render after this, so they stay tappable above it. */}
      {!srcDismissed && !(canPlay && sourceReady) && (
        <Pressable style={[styles.fbGate, windowFill]} onPress={() => {}}>
          <ActivityIndicator size="large" color={C.ACCENT_HOT} />
        </Pressable>
      )}

      {/* Play button over the IG / TikTok / studio source. Their players sit above the reaction and hide
          the base play icon (above), so surface one here once loaded. Visual only (pointerEvents="none"):
          the tap falls through to the embed / source tap-surface (which drives play/pause). */}
      {(reaction?.source_type === 'instagram' || reaction?.source_type === 'tiktok' || !!studioSourceUri) && paused && !srcDismissed && canPlay && sourceReady && (
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playCircle}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>
      )}

      {/* Replayed emoji throws — re-emitted as playback reaches each recorded timestamp. */}
      <EmojiFountain ref={fountainRef} />

      {/* Handle + timer */}
      <View style={[styles.infoBar, { top: topInset + SPACE.SM }]} pointerEvents="none">
        <Text style={styles.handle}>@{handle}</Text>
        <Text style={styles.timer}>{fmt(progress)} / {fmt(totalDuration)}</Text>
      </View>

      {/* Emoji drawer — right side, collapses into toggle button */}
      <View style={[styles.emojiDrawer, { right: SPACE.MD, bottom: bottomInset + SPACE.LG }]}>
        {emojiOpen && (
          <ScrollView
            style={[styles.emojiList, { maxHeight: height * 0.6 }]}
            contentContainerStyle={styles.emojiListContent}
            showsVerticalScrollIndicator={false}>
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
          </ScrollView>
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
        onPress={() => shareTextNative('Watch my reaction on Vidrip', `vidrip://reaction/${reactionId}`)}>
        <Ionicons name="share-outline" size={20} color={C.WHITE} />
      </TouchableOpacity>

      {/* Report / block this reaction's author */}
      {reactorId !== user?.id && (
        <View style={[styles.moreBtn, { top: topInset + SPACE.SM }]}>
          <ContentActions
            targetType="reaction"
            targetId={reactionId}
            targetUserId={reactorId}
            handle={handle === '?' ? null : handle}
            color={C.WHITE}
            size={20}
          />
        </View>
      )}

      {/* Close */}
      <TouchableOpacity
        style={[styles.closeBtn, { top: topInset + SPACE.SM }]}
        onPress={() => navigation.goBack()}>
        <Text style={styles.closeTxt}>✕</Text>
      </TouchableOpacity>

      {/* Restart — rewind the reaction + source to the top and play (like the recorder's ↺). */}
      {hasStarted && !srcDismissed && (
        <TouchableOpacity
          style={[styles.restartBtn, { bottom: bottomInset + SPACE.LG }]}
          onPress={handleRestart}
          activeOpacity={0.85}>
          <Ionicons name="refresh" size={22} color={C.WHITE} />
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
  // FB load gate: opaque black + spinner over the video/source until the embed is ready (absorbs taps).
  // No zIndex — render order already puts it above the source block, while the later-rendered controls
  // (incl. back) stay on top, so the user is never trapped here if FB fails to load.
  fbGate: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center',
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
    width: 52,
    marginBottom: SPACE.SM,
  },
  emojiListContent: {
    alignItems: 'center',
    gap: SPACE.SM,
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
  restartBtn: {
    position: 'absolute', left: SPACE.LG,
    width: 44, height: 44, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  moreBtn: {
    position: 'absolute', right: SPACE.LG + 88,
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
