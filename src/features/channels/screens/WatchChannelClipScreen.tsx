import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, useWindowDimensions, Platform,
} from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import TikTokPlayer, { type TikTokPlayerHandle } from '../../../components/TikTokPlayer';
import InstagramPlayer, { type InstagramPlayerHandle } from '../../../components/InstagramPlayer';
import { configureForMixedPlayback } from '../../../infrastructure/native/audioRecorder';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSequence, withSpring, withTiming, interpolate, Easing,
} from 'react-native-reanimated';

// Height of the source player when shrunk into the corner (screen-aspect mini).
const PIP_H = 184;
import { Pressable } from 'react-native';
import Video from 'react-native-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { supabase } from '../../../infrastructure/supabase/client';
import {
  fetchChannelPost,
  fetchChannelPostReactions,
  addChannelPostEmojiReaction,
  removeChannelPostEmojiReaction,
  type ChannelPost,
} from '../../../infrastructure/supabase/queries/channels';
import {
  hasLocalClip,
  localPathForClip,
  downloadChannelClip,
  hasLocalAudio,
  localPathForAudio,
} from '../../../infrastructure/storage/localChannelClipStorage';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

import EmojiGlyph, { QUICK_EMOJIS } from '../../../components/EmojiGlyph';

function EmojiBtn({
  emoji, count, isMine, isDisabled, onPress,
}: {
  emoji: string; count: number; isMine: boolean;
  isDisabled: boolean; onPress: () => void;
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
        <EmojiGlyph emoji={emoji} size={24} />
        {count > 0 && (
          <Text style={[styles.emojiCount, isMine && styles.emojiCountActive]}>{count}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

export default function WatchChannelClipScreen({
  route,
  navigation,
}: ChannelsStackScreenProps<'WatchChannelClip'>) {
  const { postId } = route.params;
  const { user } = useAuthStore();
  const { width, height } = useWindowDimensions();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();

  type LoadState = 'loading' | 'downloading' | 'ready' | 'unavailable';

  const [post, setPost] = useState<ChannelPost | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [downloadPct, setDownloadPct] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [sessionReady, setSessionReady] = useState(false);
  const [parentYtVideoId, setParentYtVideoId] = useState<string | null>(null);
  const [parentSourceUri, setParentSourceUri] = useState<string | null>(null); // instagram parent file
  const [parentSourceType, setParentSourceType] = useState<'youtube' | 'tiktok' | 'instagram' | 'bunny'>('youtube');

  const videoRef = useRef<any>(null);
  const ytRef = useRef<any>(null);
  const ttRef = useRef<TikTokPlayerHandle>(null);
  const igRef = useRef<InstagramPlayerHandle>(null);
  const igTimeRef = useRef(0); // latest instagram-source playhead (from onCurrentTime)
  // True while we're force-stopping at the end — ignore the source's auto "playing"
  // (seekTo resumes YouTube, which would otherwise loop the source).
  const stoppingRef = useRef(false);
  // Defer the YouTube rewind until it reports 'paused', so seekTo doesn't resume it.
  const pendingYtSeekRef = useRef(false);
  // Ordered ids of sibling reaction clips (same parent) — drives auto-advance.
  const siblingIdsRef = useRef<string[]>([]);
  // Latest reaction playhead (seconds) — read by the source-sync loop without re-running it.
  const progressRef = useRef(0);

  useEffect(() => {
    (async () => {
      const p = await fetchChannelPost(postId).catch(() => null);
      if (!p) { setLoadState('unavailable'); return; }
      setPost(p);

      // Fetch parent post's YouTube video ID for PIP + sibling reactions for auto-advance
      if (p.parent_post_id) {
        fetchChannelPost(p.parent_post_id)
          .then(parent => {
            if (!parent) { return; }
            setParentSourceType(parent.source_type ?? 'youtube');
            if (parent.source_type === 'instagram') {
              setParentSourceUri(parent.video_url ?? null); // instagram plays the re-hosted file
            } else if (parent.yt_video_id) {
              setParentYtVideoId(parent.yt_video_id);
            }
          })
          .catch(() => {});
        fetchChannelPostReactions(p.parent_post_id)
          .then(list => { siblingIdsRef.current = list.map(x => x.id); })
          .catch(() => {});
      }

      const isAudio = p.post_type === 'audio';

      // Audio posts are always local — no cloud URL
      if (isAudio) {
        if (await hasLocalAudio(postId)) {
          const path = localPathForAudio(postId);
          setLocalUri(Platform.OS === 'ios' ? path : `file://${path}`);
          setLoadState('ready');
        } else {
          setLoadState('unavailable');
        }
        return;
      }

      // Check local cache first — local-only clips have no video_url
      if (await hasLocalClip(postId)) {
        const path = localPathForClip(postId);
        setLocalUri(Platform.OS === 'ios' ? path : `file://${path}`);
        setLoadState('ready');
        return;
      }

      if (!p.video_url) { setLoadState('unavailable'); return; }

      // Download to device then play
      setLoadState('downloading');
      try {
        const dest = await downloadChannelClip(postId, p.video_url, setDownloadPct);
        setLocalUri(Platform.OS === 'ios' ? dest : `file://${dest}`);
        setLoadState('ready');
      } catch {
        setLoadState('unavailable');
      }
    })();
  }, [postId]);

  // Realtime emoji updates
  useEffect(() => {
    if (!post) { return; }
    const channel = (supabase as any)
      .channel(`cper-clip:${postId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'channel_post_emoji_reactions',
        filter: `post_id=eq.${postId}`,
      }, () => {
        (supabase as any)
          .from('channel_post_emoji_reactions')
          .select('emoji, user_id')
          .eq('post_id', postId)
          .then(({ data }: any) => {
            if (data) { setPost(p => p ? { ...p, emoji_reactions: data } : p); }
          });
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [postId, post?.id]);

  // Source player: full-screen until playback starts, then shrinks to the corner
  // (uniform scale of the whole screen, so no distortion) revealing the reaction.
  const pip = useSharedValue(0);
  useEffect(() => {
    pip.value = withTiming(hasStarted ? 1 : 0, { duration: 650, easing: Easing.inOut(Easing.cubic) });
  }, [hasStarted, pip]);
  const srcStyle = useAnimatedStyle(() => {
    const sFinal = PIP_H / height;
    const s = interpolate(pip.value, [0, 1], [1, sFinal]);
    const tx = interpolate(pip.value, [0, 1], [0, (width * (1 - sFinal)) / 2 - SPACE.LG]);
    const ty = interpolate(pip.value, [0, 1], [0, (height * (1 - sFinal)) / 2 - (bottomInset + 100)]);
    return { transform: [{ translateX: tx }, { translateY: ty }, { scale: s }] };
  });
  // Full-screen YouTube uses a cover crop (16:9 scaled to fill height), centered.
  const ytCoverW = Math.round(height * (16 / 9));
  const ytOffsetX = -Math.round((ytCoverW - width) / 2);

  // TikTok has no `play` prop, so push our paused state into it.
  useEffect(() => {
    if (parentSourceType !== 'tiktok') { return; }
    if (paused) { ttRef.current?.pause(); } else { ttRef.current?.play(); }
  }, [paused, parentSourceType]);

  // Instagram source (react-native-video) — push our paused state in, like TikTok.
  useEffect(() => {
    if (parentSourceType !== 'instagram') { return; }
    if (paused) { igRef.current?.pause(); } else { igRef.current?.play(); }
  }, [paused, parentSourceType]);

  // Keep the instagram source locked to the reaction clip's clock (it reports its
  // playhead via onCurrentTime → igTimeRef). Nudge it back only on meaningful drift.
  useEffect(() => {
    if (paused || parentSourceType !== 'instagram') { return; }
    const id = setInterval(() => {
      if (stoppingRef.current) { return; }
      const target = progressRef.current;
      if (Math.abs(igTimeRef.current - target) > 0.5) { igRef.current?.seekTo?.(target); }
    }, 1200);
    return () => clearInterval(id);
  }, [paused, parentSourceType]);

  // Keep the parent YouTube source locked to the reaction clip's clock. The clip is
  // the master; the source (which plays from 0) should sit at the same playhead.
  // Without this they drift (YouTube load latency on start, clock skew over the clip).
  // Nudge YouTube back only on meaningful drift to avoid constant seeks. (TikTok
  // exposes no current-time, so it can't be corrected this way.)
  useEffect(() => {
    if (paused || parentSourceType !== 'youtube' || !parentYtVideoId) { return; }
    const id = setInterval(async () => {
      if (stoppingRef.current) { return; }
      try {
        const ytTime = await ytRef.current?.getCurrentTime?.();
        if (typeof ytTime !== 'number') { return; }
        const target = progressRef.current;
        if (Math.abs(ytTime - target) > 0.5) { ytRef.current?.seekTo?.(target, true); }
      } catch { /* player not ready */ }
    }, 1200);
    return () => clearInterval(id);
  }, [paused, parentSourceType, parentYtVideoId]);

  // When the reaction clip ends: halt the source, then auto-advance to the next
  // reaction in the sequence — or dismiss back (card pop) when it's the last.
  const handleReactionEnd = useCallback(() => {
    stoppingRef.current = true;
    setPaused(true);
    ttRef.current?.pause();

    // Standalone clip (no parent) has no reaction sequence — rewind and hold.
    if (!post?.parent_post_id) {
      setProgress(0);
      videoRef.current?.seek(0);
      return;
    }

    const ids = siblingIdsRef.current;
    const idx = ids.indexOf(postId);
    const nextId = idx >= 0 ? ids[idx + 1] : undefined;
    if (nextId) {
      navigation.replace('WatchChannelClip', { postId: nextId });
    } else {
      navigation.goBack();
    }
  }, [post?.parent_post_id, postId, navigation]);

  const handleEmojiPress = useCallback(async (emoji: string) => {
    if (!post || !user?.id || processing.has(emoji)) { return; }
    const mine = post.emoji_reactions.find(r => r.emoji === emoji && r.user_id === user.id);

    setProcessing(prev => new Set([...prev, emoji]));
    setPost(p => {
      if (!p) { return p; }
      return {
        ...p,
        emoji_reactions: mine
          ? p.emoji_reactions.filter(r => !(r.emoji === emoji && r.user_id === user.id))
          : [...p.emoji_reactions, { emoji, user_id: user.id! }],
      };
    });

    try {
      if (mine) {
        await removeChannelPostEmojiReaction(post.id, user.id, emoji);
      } else {
        await addChannelPostEmojiReaction(post.id, user.id, emoji);
      }
    } catch { /* realtime will reconcile */ }

    setProcessing(prev => { const n = new Set(prev); n.delete(emoji); return n; });
  }, [post, user?.id, processing]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  if (loadState === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT_HOT} size="large" />
        <TouchableOpacity
          style={[styles.closeBtn, { top: topInset + SPACE.SM }]}
          onPress={() => navigation.goBack()}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loadState === 'downloading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT_HOT} size="large" />
        <Text style={styles.downloadText}>Downloading to your device…</Text>
        {downloadPct > 0 && (
          <View style={styles.progressWrap}>
            <View style={[styles.progressBarDl, { width: `${downloadPct}%` as any }]} />
          </View>
        )}
        {downloadPct > 0 && <Text style={styles.downloadPct}>{downloadPct}%</Text>}
        <TouchableOpacity
          style={[styles.closeBtn, { top: topInset + SPACE.SM }]}
          onPress={() => navigation.goBack()}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loadState === 'unavailable' || !localUri) {
    return (
      <View style={styles.center}>
        <Text style={styles.unavailText}>Video unavailable</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.goBack}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalDuration = duration || (post.duration ?? 0);
  const progressPct = totalDuration > 0 ? Math.min((progress / totalDuration) * 100, 100) : 0;
  const counts = (post.emoji_reactions ?? []).reduce((acc: Record<string, number>, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});

  // Standalone clip (no parent YouTube post) → main video self-controls via tap.
  const hasParent = !!post?.parent_post_id;

  const videoEl = (
    <Video
      ref={videoRef}
      source={{ uri: localUri }}
      style={{ width, height }}
      resizeMode="contain"
      paused={paused}
      mixWithOthers="mix"
      disableFocus={Platform.OS === 'android'}
      onLoad={(d: any) => {
        setDuration(d.duration);
        configureForMixedPlayback().then(() => setSessionReady(true)).catch(() => setSessionReady(true));
      }}
      onProgress={(d: any) => { progressRef.current = d.currentTime; setProgress(d.currentTime); }}
      onEnd={handleReactionEnd}
      repeat={false}
    />
  );

  return (
    <View style={styles.container}>
      {/* Full-screen video — YouTube PIP drives it when there's a parent,
          otherwise tap the video to play/pause. */}
      {hasParent ? (
        <View style={StyleSheet.absoluteFill}>{videoEl}</View>
      ) : (
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => { setPaused(p => !p); setHasStarted(true); }}>
          {videoEl}
        </TouchableOpacity>
      )}

      {/* Pause indicator — standalone clips only */}
      {!hasParent && paused && (
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playCircle}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>
      )}

      {/* Source player — full-screen, then animates into the corner on play. */}
      {sessionReady && (parentYtVideoId || parentSourceUri) && (
        <Animated.View style={[StyleSheet.absoluteFill, srcStyle]}>
          {parentSourceType === 'instagram' && parentSourceUri ? (
            <View style={{ width, height }}>
              <InstagramPlayer
                ref={igRef}
                uri={parentSourceUri}
                // Unlike the YouTube/TikTok WebView sources, the Instagram source is
                // a re-hosted file (react-native-video) whose audio the mic barely
                // captures during recording — so the bleed model gives silence. Play
                // the HQ source live instead (it's sync-locked to the reaction clock).
                startMuted={false}
                style={{ width, height }}
                onCurrentTime={(t) => { igTimeRef.current = t; }}
              />
              {/* No native controls — tap to start/toggle (drives the reaction clip too). */}
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={() => { setHasStarted(true); setPaused(p => !p); }}>
                {paused && (
                  <View style={styles.playOverlay} pointerEvents="none">
                    <View style={styles.playCircle}><Text style={styles.playIcon}>▶</Text></View>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          ) : parentSourceType === 'tiktok' ? (
            <TikTokPlayer
              ref={ttRef}
              startMuted={!post?.recorded_with_headphones}
              style={{ width, height, backgroundColor: '#000' }}
              videoId={parentYtVideoId as string}
              onChangeState={(state) => {
                if (state === 'playing') {
                  if (stoppingRef.current) { setPaused(true); return; }
                  setPaused(false); setHasStarted(true);
                }
                else if (state === 'paused') { setPaused(true); }
                // 'ended' (source finished first): ignore — the reaction's own onEnd
                // drives auto-advance; rewinding it here would loop it.
              }}
            />
          ) : (
            <View style={{ width, height, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', left: ytOffsetX }}>
                <YoutubePlayer
                  ref={ytRef}
                  height={height}
                  width={ytCoverW}
                  videoId={parentYtVideoId as string}
                  mute={!post?.recorded_with_headphones}
                  play={Platform.OS === 'ios' ? !paused : undefined}
                  onChangeState={(state) => {
                    // Video has mixWithOthers="mix" so it never interrupts the WebView —
                    // YouTube play/pause maps directly to the reaction video.
                    if (state === 'playing') {
                      if (stoppingRef.current) { return; }   // stray resume during stop → ignore
                      setPaused(false); setHasStarted(true);
                    }
                    else if (state === 'paused') {
                      setPaused(true);
                      if (pendingYtSeekRef.current) {
                        pendingYtSeekRef.current = false;
                        ytRef.current?.seekTo?.(0, true);   // confirmed paused → stays at 0
                        setTimeout(() => { stoppingRef.current = false; }, 300);
                      }
                    }
                    // 'ended' (source finished first): ignore — the reaction's own
                    // onEnd drives auto-advance; rewinding it here would loop it.
                  }}
                  initialPlayerParams={{ controls: true, rel: false, mute: 1 } as any}
                  webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
                  webViewStyle={{ backgroundColor: '#000' }}
                />
              </View>
            </View>
          )}
        </Animated.View>
      )}

      {/* Info bar */}
      <View style={[styles.infoBar, { top: topInset + SPACE.SM }]} pointerEvents="none">
        <Text style={styles.handle}>@{post.poster?.handle ?? '?'}</Text>
        <Text style={styles.timer}>{fmt(progress)} / {fmt(totalDuration)}</Text>
      </View>

      {/* Emoji drawer — 😊 toggle hidden for own posts, reactions always visible */}
      <View style={[styles.emojiDrawer, { right: SPACE.MD, bottom: bottomInset + SPACE.LG }]}>
        {emojiOpen && (
          <View style={styles.emojiList}>
            {QUICK_EMOJIS.map(emoji => (
              <EmojiBtn
                key={emoji}
                emoji={emoji}
                count={counts[emoji] ?? 0}
                isMine={post.emoji_reactions.some(r => r.emoji === emoji && r.user_id === user?.id)}
                isDisabled={post.poster_id === user?.id || processing.has(emoji)}
                onPress={() => handleEmojiPress(emoji)}
              />
            ))}
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

      {/* DEV: trigger the dock animation when the source won't play (e.g. TikTok in sim) */}
      {__DEV__ && parentYtVideoId && (
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
  unavailText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  goBack: { color: C.ACCENT_HOT, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM },
  downloadText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },
  downloadPct: { color: C.SUBTLE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  progressWrap: {
    width: 180, height: 4, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden',
  },
  progressBarDl: { height: 4, backgroundColor: C.ACCENT_HOT, borderRadius: RADIUS.FULL },
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
    flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center',
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
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    gap: 2,
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
  ytPip: {
    position: 'absolute',
    width: 90, height: 160,
    borderRadius: RADIUS.MD, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
  },
  ytPipInner: { position: 'absolute' },
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
  closeBtn: {
    position: 'absolute', right: SPACE.LG,
    width: 36, height: 36, borderRadius: RADIUS.FULL,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: C.WHITE, fontSize: 16, fontFamily: FONT.BODY_BOLD, lineHeight: 20 },
});
