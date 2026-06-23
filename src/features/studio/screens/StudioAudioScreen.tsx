import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import Video, { type VideoRef } from 'react-native-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import Slider from '../components/Slider';
import GradientButton from '../components/GradientButton';
import SaveForLaterButton from '../components/SaveForLaterButton';
import StudioMusicPreview from '../components/StudioMusicPreview';
import MusicPickerSheet from '../music/MusicPickerSheet';
import { resolveTrackFile, type MusicTrack } from '../music/library';
import { useStudioAutosave } from '../useStudioAutosave';
import { getDraft } from '../../../infrastructure/storage/studioDraftStorage';
import type { AudioTrack, StudioAudio } from '../effectRecipe';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

// Background-music step. Pick a curated track, set its volume, and choose whether to keep the recorded
// audio (mix under the music) or replace it. Non-destructive: the config autosaves to the draft and is
// baked at the Overlay→Details export. A pre-mode track (added on capture) shows here for volume tweaks.
type PickedTrack = { id: string; title: string; uri: string; mode: 'pre' | 'post' };

export default function StudioAudioScreen({ route, navigation }: StudioStackScreenProps<'StudioAudio'>) {
  const { fileUri, durationSec, trimStartMs, trimEndMs, colorMatrix, mirror, draftId } = route.params;
  const { top } = useSafeAreaInsets();

  const [track, setTrack] = useState<PickedTrack | null>(null);
  const [musicVolume, setMusicVolume] = useState(0.6);
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [sheet, setSheet] = useState(false);
  const [paused, setPaused] = useState(false);
  // Gate audio autosave until the draft has been read, so the first (pre-hydration) save can't write a
  // null over an existing track and wipe audio set earlier in the flow.
  const [hydrated, setHydrated] = useState(!draftId);

  const isFocused = useIsFocused();
  const mainRef = useRef<VideoRef>(null);
  const lastT = useRef(0);
  const [wrapKey, setWrapKey] = useState(0);   // bumped when the preview video loops → music reseeks
  const clipMs = durationSec ? durationSec * 1000 : undefined;

  // Detect the preview loop (currentTime jumps back) and tell the music to restart in lockstep.
  const onMainProgress = useCallback((p: { currentTime: number }) => {
    if (p.currentTime + 0.25 < lastT.current) { setWrapKey(k => k + 1); }
    lastT.current = p.currentTime;
  }, []);

  // Returning to this screen (Back) replays from the top — video + music together.
  useFocusEffect(useCallback(() => {
    mainRef.current?.seek(0);
    lastT.current = 0;
    setWrapKey(k => k + 1);
    return () => {};
  }, []));

  // Hydrate any existing audio (a pre-mode track from capture, or a resumed post config).
  useEffect(() => {
    if (!draftId) { return; }
    let alive = true;
    getDraft(draftId).then(d => {
      if (!alive) { return; }
      const a = d?.audio; const t = a?.tracks?.[0];
      if (t) {
        setTrack({ id: t.id, title: t.title, uri: t.uri, mode: t.mode });
        setMusicVolume(t.volume);
        setKeepOriginal(a!.keepOriginal);
        setOriginalVolume(a!.originalVolume);
      }
    }).catch(() => {}).finally(() => { if (alive) { setHydrated(true); } });
    return () => { alive = false; };
  }, [draftId]);

  const onPick = useCallback(async (picked: MusicTrack | null) => {
    if (!picked) { setTrack(null); return; }
    try {
      const uri = await resolveTrackFile(picked.id, picked.url);
      setTrack({ id: picked.id, title: picked.title, uri, mode: 'post' });
    } catch { /* leave the current track; the picker streams previews so a failed cache is non-fatal */ }
  }, []);

  // The persisted/baked config. `mode:'pre'` means the recording is video-only → keepOriginal is moot.
  const audio: StudioAudio | null = track
    ? {
        tracks: [{ id: track.id, uri: track.uri, title: track.title, volume: musicVolume, mode: track.mode } as AudioTrack],
        keepOriginal: track.mode === 'pre' ? false : keepOriginal,
        originalVolume,
      }
    : null;

  // Omit `audio` from the patch until hydrated — updateDraft merges, so leaving the key out preserves
  // whatever audio is already on the draft (and avoids a null-overwrite during the load race).
  useStudioAutosave(draftId, 'audio',
    hydrated
      ? { audio, durationSec, trimStartMs, trimEndMs, colorMatrix, mirror }
      : { durationSec, trimStartMs, trimEndMs, colorMatrix, mirror });

  const next = useCallback(() => {
    navigation.navigate('StudioOverlay', { fileUri, durationSec, trimStartMs, trimEndMs, colorMatrix, mirror, draftId });
  }, [navigation, fileUri, durationSec, trimStartMs, trimEndMs, colorMatrix, mirror, draftId]);

  const showMix = !!track && track.mode === 'post';   // pre = video-only, no original to mix

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={C.INK} />
        </TouchableOpacity>
        <Text style={styles.title}>Music</Text>
        {draftId ? <SaveForLaterButton onPress={() => navigation.popToTop()} /> : <View style={{ width: 26 }} />}
      </View>

      {/* Preview: the video plays its recorded audio (at the original volume), the music layers over it. */}
      <Pressable style={styles.preview} onPress={() => setPaused(p => !p)}>
        <Video
          ref={mainRef}
          source={{ uri: fileUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          repeat
          paused={paused || !isFocused}
          muted={track ? (track.mode === 'pre' ? true : !keepOriginal) : false}
          volume={keepOriginal ? originalVolume : 0}
          mixWithOthers="mix"
          onProgress={onMainProgress}
          progressUpdateInterval={150}
        />
        {track && (
          <StudioMusicPreview uri={track.uri} volume={musicVolume} clipMs={clipMs} restartKey={wrapKey} paused={paused} />
        )}
        {paused && (
          <View style={styles.playOverlay} pointerEvents="none">
            <Ionicons name="play" size={42} color="rgba(255,255,255,0.92)" />
          </View>
        )}
      </Pressable>

      {/* Track row */}
      <TouchableOpacity style={styles.trackRow} onPress={() => setSheet(true)} activeOpacity={0.85}>
        <Ionicons name="musical-notes" size={20} color={track ? C.ACCENT : C.MUTED} />
        <Text style={styles.trackTxt} numberOfLines={1}>{track ? track.title : 'Add music'}</Text>
        <Ionicons name="chevron-forward" size={18} color={C.SUBTLE} />
      </TouchableOpacity>

      {track && (
        <View style={styles.controls}>
          <Slider label="Music volume" value={musicVolume} min={0} max={1}
            onChange={setMusicVolume} format={(v) => `${Math.round(v * 100)}%`} />

          {showMix && (
            <>
              <TouchableOpacity onPress={() => setKeepOriginal(k => !k)} activeOpacity={0.85}
                style={[styles.toggle, keepOriginal && styles.toggleOn]}>
                <Ionicons name={keepOriginal ? 'mic' : 'mic-off'} size={18} color={keepOriginal ? C.ACCENT : C.MUTED} />
                <Text style={[styles.toggleTxt, keepOriginal && styles.toggleTxtOn]}>
                  {keepOriginal ? 'Keeping recorded audio' : 'Music only (recorded audio off)'}
                </Text>
              </TouchableOpacity>
              {keepOriginal && (
                <Slider label="Recorded audio volume" value={originalVolume} min={0} max={1}
                  onChange={setOriginalVolume} format={(v) => `${Math.round(v * 100)}%`} />
              )}
            </>
          )}
        </View>
      )}

      <View style={styles.footer}>
        <GradientButton label="Next" onPress={next} />
      </View>

      <MusicPickerSheet visible={sheet} currentId={track?.id} onSelect={onPick} onClose={() => setSheet(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.LG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.MD },
  title: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  preview: { flex: 1, borderRadius: RADIUS.MD, backgroundColor: '#000', overflow: 'hidden', marginBottom: SPACE.MD, alignItems: 'center', justifyContent: 'center' },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  trackRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.MD, borderRadius: RADIUS.MD,
    backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER, marginBottom: SPACE.SM,
  },
  trackTxt: { flex: 1, color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },
  controls: { paddingTop: SPACE.XS },
  toggle: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM, borderRadius: RADIUS.FULL,
    backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER, alignSelf: 'flex-start', marginVertical: SPACE.SM,
  },
  toggleOn: { borderColor: C.ACCENT },
  toggleTxt: { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  toggleTxtOn: { color: C.INK },
  footer: { paddingVertical: SPACE.MD, paddingBottom: SPACE.LG },
});
