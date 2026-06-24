import { log } from '../../../infrastructure/logging/logger';
import React, { useCallback, useState } from 'react';
import CameraWarmup from '../../lens/CameraWarmup';
import EffectWarmup from '../components/EffectWarmup';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { fetchMyCreatorVideos, refreshCreatorVideoStatus, type MyCreatorVideo } from '../../../infrastructure/creatorStudio/api';
import { deleteChannelPost } from '../../../infrastructure/supabase/queries/channels';
import { listDrafts, deleteDraft, type StudioDraft } from '../../../infrastructure/storage/studioDraftStorage';
import BunnyEmbedPlayer from '../components/BunnyEmbedPlayer';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

const STATUS: Record<string, { label: string; color: string }> = {
  uploading:  { label: 'Uploading',  color: C.SUBTLE },
  processing: { label: 'Processing', color: C.GOLD },
  ready:      { label: 'Live',       color: C.SUCCESS },
  failed:     { label: 'Failed',     color: C.DANGER },
};

const STAGE_LABEL: Record<StudioDraft['stage'], string> = {
  trim: 'Trim', filter: 'Looks', audio: 'Music', overlay: 'Overlays', details: 'Ready to post',
};

const ago = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) { return 'just now'; }
  const m = Math.floor(s / 60); if (m < 60) { return `${m}m ago`; }
  const h = Math.floor(m / 60); if (h < 24) { return `${h}h ago`; }
  return `${Math.floor(h / 24)}d ago`;
};

const isScheduled = (v: MyCreatorVideo) => !!v.releaseDate && new Date(v.releaseDate).getTime() > Date.now();
const fmtRelease = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function StudioHomeScreen({ navigation }: StudioStackScreenProps<'StudioHome'>) {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'published' | 'scheduled' | 'drafts'>('published');
  const [videos, setVideos] = useState<MyCreatorVideo[]>([]);
  const [drafts, setDrafts] = useState<StudioDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusBusy, setStatusBusy] = useState<string | null>(null); // postId currently re-checking
  // Play inline as an overlay (NOT a separate/nested native screen) — a WKWebView video
  // nested under react-native-screens inside this modal renders black; an in-place
  // overlay composites like the reaction recorder's WebView does.
  const [playing, setPlaying] = useState<{ postId: string; title: string } | null>(null);

  const load = useCallback(async () => {
    try { setDrafts(await listDrafts()); } catch { /* local — ignore */ }
    if (user?.id) {
      try { setVideos(await fetchMyCreatorVideos(user.id)); }
      catch (e) { log.error('[studio] load', e); }
    }
    setLoading(false); setRefreshing(false);
  }, [user?.id]);

  // Refetch on focus so processing → live transitions (and freshly-saved drafts) show up.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startNew = () => navigation.navigate('StudioCapture');

  // On-demand status re-check (fallback when the Bunny webhook is delayed/missing).
  const onRefreshStatus = async (item: MyCreatorVideo) => {
    if (statusBusy) { return; }
    setStatusBusy(item.id);
    try {
      const status = await refreshCreatorVideoStatus(item.id);
      setVideos(prev => prev.map(v => (v.id === item.id ? { ...v, status } : v)));
    } catch (e: any) {
      Alert.alert('Couldn’t refresh', e?.message ?? 'Try again in a moment.');
    } finally {
      setStatusBusy(null);
    }
  };

  const onDelete = (item: MyCreatorVideo) => {
    Alert.alert('Delete video?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setVideos(prev => prev.filter(v => v.id !== item.id));
        try { await deleteChannelPost(item.id); } catch { load(); }
      } },
    ]);
  };

  const onDeleteDraft = (d: StudioDraft) => {
    Alert.alert('Delete draft?', d.title?.trim() || 'Untitled draft', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setDrafts(prev => prev.filter(x => x.id !== d.id));
        await deleteDraft(d.id).catch(() => {});
      } },
    ]);
  };

  // Resume saved progress at the furthest stage reached, hydrating each screen's editable state.
  const resumeLastSaved = (d: StudioDraft) => {
    const trimStartMs = d.trimStartMs ?? 0;
    const trimEndMs = d.trimEndMs ?? (d.durationSec ?? 0) * 1000;
    if (d.stage === 'details') {
      navigation.navigate('StudioDetails', {
        fileUri: d.snapshotFile ?? d.rawFile, recipe: d.recipe ?? null, durationSec: d.durationSec,
        draftId: d.id, title: d.title, channelId: d.channelId, visibility: d.visibility,
      });
    } else if (d.stage === 'overlay') {
      navigation.navigate('StudioOverlay', {
        fileUri: d.rawFile, durationSec: d.durationSec, trimStartMs, trimEndMs,
        colorMatrix: d.colorMatrix ?? null, mirror: d.mirror, recipe: d.recipe ?? null, draftId: d.id,
      });
    } else if (d.stage === 'filter') {
      navigation.navigate('StudioFilter', {
        fileUri: d.rawFile, durationSec: d.durationSec, trimStartMs, trimEndMs,
        filterKey: d.filterKey, adjust: d.adjust, mirror: d.mirror, draftId: d.id,
      });
    } else {
      navigation.navigate('StudioTrim', {
        fileUri: d.rawFile, durationSec: d.durationSec, trimStartMs: d.trimStartMs, trimEndMs: d.trimEndMs, draftId: d.id,
      });
    }
  };

  const openDraft = (d: StudioDraft) => {
    Alert.alert(
      'Resume draft',
      'Pick up from your last saved progress, or start over from the raw footage?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Raw footage', onPress: () => navigation.navigate('StudioTrim', { fileUri: d.rawFile, durationSec: d.durationSec, draftId: d.id }) },
        { text: 'Last saved', onPress: () => resumeLastSaved(d) },
      ],
    );
  };

  const renderVideo = ({ item }: { item: MyCreatorVideo }) => {
    const scheduled = isScheduled(item);
    const st = STATUS[item.status] ?? STATUS.processing;
    const playable = item.status === 'ready';
    return (
      <TouchableOpacity
        style={styles.row} activeOpacity={playable ? 0.8 : 1}
        onPress={() => playable && setPlaying({ postId: item.id, title: item.title })}>
        {item.thumbnail
          ? <Image source={{ uri: item.thumbnail }} style={styles.thumb} resizeMode="cover" />
          : <View style={[styles.thumb, styles.thumbPlaceholder]}><Ionicons name="film-outline" size={20} color={C.SUBTLE} /></View>}
        <View style={styles.meta}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.rowSub}>
            {scheduled ? (
              <>
                <Ionicons name="calendar" size={12} color={C.ACCENT_HOT} />
                <Text style={[styles.statusText, { color: C.ACCENT_HOT, marginLeft: 4 }]}>{fmtRelease(item.releaseDate!)}</Text>
              </>
            ) : (
              <>
                <View style={[styles.statusDot, { backgroundColor: st.color }]} />
                <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
              </>
            )}
            <Ionicons
              name={item.visibility === 'subscribers' ? 'lock-closed' : 'globe-outline'}
              size={12} color={C.SUBTLE} style={{ marginLeft: SPACE.SM }} />
            <Text style={styles.visText}>{item.visibility === 'subscribers' ? 'Subscribers' : 'Public'}</Text>
          </View>
        </View>
        {item.status !== 'ready' && (
          <TouchableOpacity onPress={() => onRefreshStatus(item)} hitSlop={10} style={styles.del} disabled={statusBusy === item.id}>
            {statusBusy === item.id
              ? <ActivityIndicator size="small" color={C.MUTED} />
              : <Ionicons name="refresh" size={18} color={C.MUTED} />}
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => onDelete(item)} hitSlop={10} style={styles.del}>
          <Ionicons name="trash-outline" size={18} color={C.MUTED} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderDraft = ({ item }: { item: StudioDraft }) => (
    <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => openDraft(item)}>
      {item.thumbUri
        ? <Image source={{ uri: item.thumbUri }} style={styles.thumb} resizeMode="cover" />
        : <View style={[styles.thumb, styles.thumbPlaceholder]}><Ionicons name="film-outline" size={20} color={C.SUBTLE} /></View>}
      <View style={styles.meta}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title?.trim() || 'Untitled draft'}</Text>
        <View style={styles.rowSub}>
          <Ionicons name="create-outline" size={12} color={C.GOLD} />
          <Text style={[styles.statusText, { color: C.GOLD, marginLeft: 4 }]}>{STAGE_LABEL[item.stage]}</Text>
          <Text style={styles.visText}>· edited {ago(item.updatedAt)}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => onDeleteDraft(item)} hitSlop={10} style={styles.del}>
        <Ionicons name="trash-outline" size={18} color={C.MUTED} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const showingDrafts = tab === 'drafts';
  // Split the creator's videos into upcoming (future release_date) vs already-published.
  const scheduledVideos = videos.filter(isScheduled);
  const publishedVideos = videos.filter(v => !isScheduled(v));
  const listData = tab === 'drafts' ? drafts : tab === 'scheduled' ? scheduledVideos : publishedVideos;
  const TABS = [
    { key: 'published', label: 'Published' },
    { key: 'scheduled', label: `Scheduled${scheduledVideos.length ? ` (${scheduledVideos.length})` : ''}` },
    { key: 'drafts', label: `Drafts${drafts.length ? ` (${drafts.length})` : ''}` },
  ] as const;

  return (
    <View style={styles.screen}>
    <CameraWarmup />
    <EffectWarmup />
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Studio</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate('StudioCollections')} hitSlop={10}>
            <Ionicons name="diamond-outline" size={22} color={C.INK} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('StudioCalendar')} hitSlop={10}>
            <Ionicons name="calendar-outline" size={23} color={C.INK} />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity activeOpacity={0.9} onPress={startNew}>
        <LinearGradient
          colors={['#FF4FA3', '#A05CFF', '#3B82F6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.newBtn}>
          <Ionicons name="add-circle" size={22} color={C.WHITE} />
          <Text style={styles.newBtnText}>New video</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Published / Scheduled / Drafts toggle */}
      <View style={styles.toggle}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.toggleBtn, tab === t.key && styles.toggleBtnOn]} onPress={() => setTab(t.key)} activeOpacity={0.85}>
            <Text style={[styles.toggleTxt, tab === t.key && styles.toggleTxtOn]} numberOfLines={1}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={listData as any[]}
        keyExtractor={(v: any) => v.id}
        contentContainerStyle={listData.length === 0 ? styles.emptyWrap : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.ACCENT} />}
        ListEmptyComponent={loading
          ? <ActivityIndicator color={C.ACCENT} style={{ marginTop: SPACE.XXXL }} />
          : <Text style={styles.empty}>{
              tab === 'drafts'
                ? 'No drafts. Recordings you don’t publish are saved here automatically.'
                : tab === 'scheduled'
                  ? 'Nothing scheduled. Pick “Schedule” when posting a video.'
                  : 'No videos yet. Tap “New video” to create your first.'}</Text>}
        renderItem={showingDrafts ? (renderDraft as any) : (renderVideo as any)}
      />
    </View>

    {/* Full-bleed overlay OUTSIDE the padded container — the padded parent collapsed
        the WebView to width:0, hiding the (playing) video. */}
    {playing && (
      <View style={StyleSheet.absoluteFillObject}>
        <BunnyEmbedPlayer postId={playing.postId} title={playing.title} onClose={() => setPlaying(null)} />
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG },
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.LG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.LG },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.LG },
  title: { fontSize: FONT.SIZES.XL, textTransform: 'uppercase', fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.SM,
    borderRadius: RADIUS.MD, marginBottom: SPACE.LG,
  },
  newBtnText: { paddingVertical: SPACE.LG, color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
  toggle: {
    flexDirection: 'row', backgroundColor: C.SURFACE, borderRadius: RADIUS.FULL,
    padding: 3, borderWidth: 1, borderColor: C.BORDER,
  },
  toggleBtn: { flex: 1, alignItems: 'center', paddingVertical: SPACE.SM, borderRadius: RADIUS.FULL },
  toggleBtnOn: { backgroundColor: C.ACCENT },
  toggleTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  toggleTxtOn: { color: C.WHITE },
  list: { paddingTop: SPACE.MD, paddingBottom: SPACE.XXXL },
  emptyWrap: { flex: 1, alignItems: 'center', marginTop: '80%' },
  empty: { color: C.MUTED, fontFamily: FONT.BODY, textAlign: 'center', paddingHorizontal: SPACE.XL },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, padding: SPACE.SM, marginBottom: SPACE.SM,
    borderWidth: 1, borderColor: C.BORDER,
  },
  thumb: { width: 64, height: 48, borderRadius: RADIUS.SM, backgroundColor: C.SURFACE_2 },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  meta: { flex: 1 },
  rowTitle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  rowSub: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  statusText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM },
  visText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, color: C.SUBTLE, marginLeft: 3 },
  del: { padding: SPACE.SM },
});
