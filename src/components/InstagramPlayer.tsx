import { log } from '../infrastructure/logging/logger';
import React, {
  forwardRef, useCallback, useImperativeHandle, useRef, useState,
} from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Video, { ViewType } from 'react-native-video';
import type { PlayerState } from './TikTokPlayer';

// Mirrors TikTokPlayerHandle so this drops into the same source-player slots on
// the watch/record screens. Instagram Reels have no controllable embed player, so
// the source is the re-hosted .mp4 file played through react-native-video — which
// gives full play/pause/seek/mute/ended, exactly what the sync loop + PIP need.
export type InstagramPlayerHandle = {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  mute: () => void;
  unMute: () => void;
};

type Props = {
  // The re-hosted Reel file URL (channel_posts.video_url for an instagram source).
  uri: string;
  // Mute on ready — used for the source PIP on watch screens (the reaction carries
  // the audio, mirroring the muted YouTube/TikTok PIP).
  startMuted?: boolean;
  // Optional still shown until the first frame decodes — e.g. a studio clip's thumbnail, so the
  // source shows its poster instead of black while the MP4 loads.
  poster?: string;
  onChangeState?: (state: PlayerState) => void;
  onReady?: () => void;
  onCurrentTime?: (currentTime: number, duration: number) => void;
  style?: StyleProp<ViewStyle>;
};

const InstagramPlayer = forwardRef<InstagramPlayerHandle, Props>(function InstagramPlayer(
  { uri, startMuted = false, poster, onChangeState, onReady, onCurrentTime, style },
  ref,
) {
  const videoRef = useRef<any>(null);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(startMuted);
  // Android ExoPlayer drops a play() (paused→false) that arrives before the player has prepared its
  // surface — so the first tap-to-play does nothing and the user taps again. Gate `paused` on this
  // flag (set once the first frame is ready) so the play intent only reaches a ready player. iOS is
  // already reliable; the gate is a no-op there.
  const [canPlay, setCanPlay] = useState(false);

  const emit = useCallback((s: PlayerState) => onChangeState?.(s), [onChangeState]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => { setPaused(false); emit('playing'); },
      pause: () => { setPaused(true); emit('paused'); },
      seekTo: (seconds: number) => videoRef.current?.seek(seconds),
      mute: () => setMuted(true),
      unMute: () => setMuted(false),
    }),
    [emit],
  );

  return (
    <Video
      ref={videoRef}
      source={{ uri }}
      style={style}
      poster={poster ? { source: { uri: poster }, resizeMode: 'cover' } : undefined}
      paused={paused || !canPlay}
      muted={muted}
      // Render into a TextureView (not the default SurfaceView) on Android so this
      // native-video source composites in the normal view hierarchy — exactly like
      // the WebView-based YouTube/TikTok/live-IG sources. This makes the semi-
      // transparent recording PIP blend identically over every source type.
      viewType={ViewType.TEXTURE}
      resizeMode="cover"
      mixWithOthers="mix"
      playInBackground={false}
      onLoad={() => { setCanPlay(true); onReady?.(); }}
      // Android: surface/first frame ready — a play command will now actually take.
      onReadyForDisplay={() => setCanPlay(true)}
      onProgress={(d: any) =>
        onCurrentTime?.(d.currentTime, d.seekableDuration ?? d.playableDuration ?? 0)}
      onEnd={() => { setPaused(true); emit('ended'); }}
      onError={(e: any) => { log.error('[InstagramPlayer] error:', JSON.stringify(e)); setPaused(true); emit('ended'); }}
      repeat={false}
    />
  );
});

export default InstagramPlayer;
