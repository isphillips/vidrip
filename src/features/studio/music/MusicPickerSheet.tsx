import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Video from 'react-native-video';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { listMusicTracks, type MusicTrack } from './library';

// Bottom-sheet picker for the curated music library (the Supabase "music" bucket). Mode-agnostic:
// returns the chosen track (or null to remove); the caller decides whether it's a pre/post track. Tracks
// stream from their public url for preview (a hidden Video); selection just hands back the track.
export default function MusicPickerSheet({
  visible, currentId, onSelect, onClose,
}: {
  visible: boolean;
  currentId?: string | null;
  onSelect: (track: MusicTrack | null) => void;
  onClose: () => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const previewUrl = tracks.find(t => t.id === previewId)?.url;

  // Load the bucket when the sheet opens (cached after the first fetch).
  useEffect(() => {
    if (!visible) { return; }
    let alive = true;
    setLoading(true);
    listMusicTracks()
      .then(t => { if (alive) { setTracks(t); } })
      .catch(() => { if (alive) { setTracks([]); } })
      .finally(() => { if (alive) { setLoading(false); } });
    return () => { alive = false; };
  }, [visible]);

  const close = () => { setPreviewId(null); onClose(); };
  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Add music</Text>

        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: SPACE.XL }}>
          {/* Remove / none */}
          <Pressable style={styles.row} onPress={() => { onSelect(null); close(); }}>
            <Ionicons name="ban-outline" size={22} color={C.SUBTLE} style={styles.rowIcon} />
            <Text style={[styles.rowTitle, { color: C.SUBTLE }]}>No music</Text>
            {!currentId && <Ionicons name="checkmark-circle" size={22} color={C.ACCENT} />}
          </Pressable>

          {loading ? (
            <ActivityIndicator color={C.ACCENT} style={{ paddingVertical: SPACE.LG }} />
          ) : tracks.length === 0 ? (
            <Text style={styles.empty}>No tracks yet. Upload royalty-free audio to the “music” storage bucket.</Text>
          ) : tracks.map(t => {
            const selected = t.id === currentId;
            const playing = t.id === previewId;
            const sub = [t.artist, t.durationSec ? fmtDur(t.durationSec) : null].filter(Boolean).join(' · ');
            return (
              <Pressable key={t.id} style={styles.row} onPress={() => { onSelect(t); close(); }}>
                <Pressable
                  hitSlop={10}
                  onPress={(e) => { e.stopPropagation?.(); setPreviewId(playing ? null : t.id); }}
                  style={styles.playBtn}>
                  <Ionicons name={playing ? 'pause' : 'play'} size={18} color={C.WHITE} />
                </Pressable>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{t.title}</Text>
                  {!!sub && <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>}
                </View>
                {selected && <Ionicons name="checkmark-circle" size={22} color={C.ACCENT} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Hidden preview player — streams the previewing track's url. */}
      {previewUrl && (
        <Video
          source={{ uri: previewUrl }}
          paused={false}
          repeat
          // eslint-disable-next-line react-native/no-inline-styles
          style={{ width: 0, height: 0 }}
          mixWithOthers="duck"
          onError={() => setPreviewId(null)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    maxHeight: '70%', backgroundColor: C.SURFACE,
    borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG,
    paddingHorizontal: SPACE.LG, paddingTop: SPACE.SM, paddingBottom: SPACE.LG,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.MUTED, marginBottom: SPACE.MD },
  title: { color: C.INK, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.LG, marginBottom: SPACE.SM },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.SM, gap: SPACE.MD },
  rowIcon: { width: 36, textAlign: 'center' },
  playBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.ACCENT,
  },
  rowText: { flex: 1 },
  rowTitle: { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },
  rowSub: { color: C.MUTED, fontFamily: FONT.BODY, fontSize: FONT.SIZES.SM, marginTop: 2 },
  empty: { color: C.MUTED, fontFamily: FONT.BODY, fontSize: FONT.SIZES.SM, paddingVertical: SPACE.LG, textAlign: 'center' },
});
