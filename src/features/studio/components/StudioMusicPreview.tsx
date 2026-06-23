import React, { useCallback, useEffect, useRef, useState } from 'react';
import Video, { type VideoRef } from 'react-native-video';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDraft } from '../../../infrastructure/storage/studioDraftStorage';

// Hidden audio player for the studio editing screens. The selected track must be audible on every
// preview screen (pre-recorded or set in-flow), restart when the screen is re-entered (Back) and when
// the looping video wraps, and never play past the clip. This component owns all of that, and gates
// playback to the focused screen so two stacked screens never play music at once.
export default function StudioMusicPreview({
  uri, volume = 1, clipMs, restartKey = 0, paused,
}: {
  uri: string;
  volume?: number;
  clipMs?: number;      // loop the track within the clip length; longer tracks are cut, not overrun
  restartKey?: number;  // bump to reseek to 0 (e.g. when the host video loops)
  paused?: boolean;
}) {
  const ref = useRef<VideoRef>(null);
  const focused = useIsFocused();
  const restart = useCallback(() => { ref.current?.seek(0); }, []);

  // Restart whenever the screen regains focus — covers returning to a screen via the Back button.
  useFocusEffect(useCallback(() => { restart(); return () => {}; }, [restart]));
  // Restart in lockstep with the host video's loop.
  useEffect(() => { if (restartKey) { restart(); } }, [restartKey, restart]);

  // Cap each cycle at the clip length so a track longer than the video doesn't keep playing.
  const onProgress = useCallback((p: { currentTime: number }) => {
    if (clipMs && p.currentTime * 1000 >= clipMs) { restart(); }
  }, [clipMs, restart]);

  return (
    <Video
      ref={ref}
      source={{ uri }}
      volume={volume}
      paused={!focused || !!paused}   // only the focused screen is audible
      repeat
      // eslint-disable-next-line react-native/no-inline-styles
      style={{ width: 0, height: 0 }}
      mixWithOthers="mix"
      ignoreSilentSwitch="ignore"
      playInBackground={false}
      onLoad={restart}
      onProgress={onProgress}
      progressUpdateInterval={100}
    />
  );
}

// The draft's chosen track (pre-mode from recording, or set on the Audio screen). Re-read on focus so a
// track added later in the flow shows up when stepping back to an earlier screen. Only one track today.
export function useDraftAudioTrack(draftId?: string): { uri: string; volume: number } | null {
  const [track, setTrack] = useState<{ uri: string; volume: number } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!draftId) { setTrack(null); return; }
    let alive = true;
    getDraft(draftId).then(d => {
      const t = d?.audio?.tracks?.[0];
      if (alive) { setTrack(t ? { uri: t.uri, volume: t.volume } : null); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [draftId]));
  return track;
}

// A counter that increments each time the screen gains focus. Used as a `key` to remount a Skia video
// preview so it replays from the start when the screen is re-entered (the Skia player has no seek).
export function useFocusReplayKey(): number {
  const [k, setK] = useState(0);
  useFocusEffect(useCallback(() => { setK(v => v + 1); return () => {}; }, []));
  return k;
}
