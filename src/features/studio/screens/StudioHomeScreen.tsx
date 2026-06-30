import { log } from '../../../infrastructure/logging/logger';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CameraWarmup from '../../lens/CameraWarmup';
import EffectWarmup from '../components/EffectWarmup';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, RefreshControl,
  TextInput, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchMyCreatorVideos, refreshCreatorVideoStatus, fetchCanCreate,
  signCreatorVideo, type MyCreatorVideo, type Visibility,
} from '../../../infrastructure/creatorStudio/api';
import { deleteChannelPost } from '../../../infrastructure/supabase/queries/channels';
import { listDrafts, deleteDraft, type StudioDraft } from '../../../infrastructure/storage/studioDraftStorage';
import BunnyEmbedPlayer from '../components/BunnyEmbedPlayer';
import BunnyVideoLayer from '../components/BunnyVideoLayer';
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
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtDuration = (sec: number | null) => {
  if (!sec || sec <= 0) { return null; }
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Inline thumbnail preview: sign + play the Bunny embed (with its overlay recipe) right in the card's
// thumb box — the bare layer, not the full-screen BunnyEmbedPlayer chrome.
function InlinePreview({ postId }: { postId: string }) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  useEffect(() => { signCreatorVideo(postId).then(setEmbedUrl).catch(() => {}); }, [postId]);
  if (!embedUrl) { return <ActivityIndicator color={C.WHITE} size="small" style={StyleSheet.absoluteFill} />; }
  // fit = the whole video sized to the box (no zoom/crop); no recipe overlay at thumb size.
  return <BunnyVideoLayer embedUrl={embedUrl} recipe={null} fit autoplay style={StyleSheet.absoluteFill} />;
}

type StatusFilter = 'all' | 'ready' | 'processing' | 'failed';
type VisFilter = 'all' | Visibility;
type ExclFilter = 'all' | 'yes' | 'no';

export default function StudioHomeScreen({ navigation }: StudioStackScreenProps<'StudioHome'>) {
  const { top } = useSafeAreaInsets();
  const { user, profile } = useAuthStore();
  // Studio recording is open to everyone, but the Collections (exclusive content) + Calendar
  // (post scheduling) tools require BOTH is_creator and the server-side creator_studio entitlement
  // (fetchCanCreate) — hide their header entrypoints otherwise.
  const isCreator = !!(profile as any)?.is_creator;
  const [canCreate, setCanCreate] = useState(false);
  const isCreatorStudio = isCreator && canCreate;
  const [tab, setTab] = useState<'published' | 'scheduled' | 'drafts'>('published');
  const [videos, setVideos] = useState<MyCreatorVideo[]>([]);
  const [drafts, setDrafts] = useState<StudioDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusBusy, setStatusBusy] = useState<string | null>(null); // postId currently re-checking
  const [playingInlineId, setPlayingInlineId] = useState<string | null>(null); // inline thumb preview
  // Play full-screen as an overlay (NOT a separate/nested native screen) — a WKWebView video
  // nested under react-native-screens inside this modal renders black; an in-place overlay composites.
  const [playing, setPlaying] = useState<{ postId: string; title: string } | null>(null);

  // Search + filter (applied to the video tabs).
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [fStatus, setFStatus] = useState<StatusFilter>('all');
  const [fVis, setFVis] = useState<VisFilter>('all');
  const [fExcl, setFExcl] = useState<ExclFilter>('all');
  const [fChannel, setFChannel] = useState<string | null>(null);

  // Resolve the server-side creator_studio entitlement (only meaningful for is_creator accounts).
  useEffect(() => {
    if (user?.id && isCreator) { fetchCanCreate(user.id).then(setCanCreate).catch(() => {}); }
  }, [user?.id, isCreator]);

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

  const toggleInline = (item: MyCreatorVideo) => {
    if (item.status !== 'ready') { return; }
    setPlayingInlineId(prev => (prev === item.id ? null : item.id));
  };

  const renderVideo = ({ item }: { item: MyCreatorVideo }) => {
    const scheduled = isScheduled(item);
    const st = STATUS[item.status] ?? STATUS.processing;
    const playable = item.status === 'ready';
    const dur = fmtDuration(item.durationSec);
    const inline = playingInlineId === item.id;
    return (
      <View style={styles.row}>
        {/* Thumbnail — tap to play inline; expand icon → full screen. */}
        <TouchableOpacity style={styles.thumbWrap} activeOpacity={playable ? 0.85 : 1} onPress={() => toggleInline(item)}>
          {inline ? (
            <InlinePreview postId={item.id} />
          ) : item.thumbnail ? (
            <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.thumbPlaceholder]}><Ionicons name="film-outline" size={20} color={C.SUBTLE} /></View>
          )}
          {playable && !inline && (
            <View style={styles.playPill}><Ionicons name="play" size={14} color="#fff" /></View>
          )}
          {playable && (
            <TouchableOpacity style={styles.expandBtn} hitSlop={8} onPress={() => setPlaying({ postId: item.id, title: item.title })}>
              <Ionicons name={inline ? 'expand' : 'scan-outline'} size={13} color="#fff" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <View style={styles.meta}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.chipRow}>
            {scheduled ? (
              <View style={styles.chip}>
                <Ionicons name="calendar" size={11} color={C.ACCENT_HOT} />
                <Text style={[styles.chipTxt, { color: C.ACCENT_HOT }]}>{fmtRelease(item.releaseDate!)}</Text>
              </View>
            ) : (
              <View style={styles.chip}>
                <View style={[styles.statusDot, { backgroundColor: st.color }]} />
                <Text style={[styles.chipTxt, { color: st.color }]}>{st.label}</Text>
              </View>
            )}
            {dur && <View style={styles.chip}><Ionicons name="time-outline" size={11} color={C.SUBTLE} /><Text style={styles.chipTxt}>{dur}</Text></View>}
            <View style={styles.chip}><Ionicons name="heart-outline" size={11} color={C.SUBTLE} /><Text style={styles.chipTxt}>{item.reactionCount}</Text></View>
            <View style={styles.chip}>
              <Ionicons name={item.visibility === 'subscribers' ? 'lock-closed' : 'globe-outline'} size={11} color={C.SUBTLE} />
              <Text style={styles.chipTxt}>{item.visibility === 'subscribers' ? 'Members' : 'Public'}</Text>
            </View>
            {item.music && (
              <View style={styles.chip}><Ionicons name="musical-notes" size={11} color={C.SUBTLE} /><Text style={styles.chipTxt} numberOfLines={1}>{item.music}</Text></View>
            )}
            {item.isExclusive && (
              <View style={[styles.chip, styles.exclChip]}>
                <Ionicons name="diamond" size={11} color={C.ACCENT_HOT} />
                <Text style={[styles.chipTxt, { color: C.ACCENT_HOT }]} numberOfLines={1}>{item.collectionName ?? 'Exclusive'}</Text>
              </View>
            )}
            {!scheduled && <Text style={[styles.chipTxt, styles.dateTxt]}>{fmtDate(item.createdAt)}</Text>}
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={() => navigation.navigate('StudioVideoEdit', { postId: item.id })} hitSlop={8} style={styles.actionBtn}>
            <Ionicons name="create-outline" size={18} color={C.MUTED} />
          </TouchableOpacity>
          {item.status !== 'ready' && (
            <TouchableOpacity onPress={() => onRefreshStatus(item)} hitSlop={8} style={styles.actionBtn} disabled={statusBusy === item.id}>
              {statusBusy === item.id ? <ActivityIndicator size="small" color={C.MUTED} /> : <Ionicons name="refresh" size={18} color={C.MUTED} />}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onDelete(item)} hitSlop={8} style={styles.actionBtn}>
            <Ionicons name="trash-outline" size={18} color={C.MUTED} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderDraft = ({ item }: { item: StudioDraft }) => (
    <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => openDraft(item)}>
      {item.thumbUri
        ? <Image source={{ uri: item.thumbUri }} style={styles.thumbWrap} resizeMode="cover" />
        : <View style={[styles.thumbWrap, styles.thumbPlaceholder]}><Ionicons name="film-outline" size={20} color={C.SUBTLE} /></View>}
      <View style={styles.meta}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title?.trim() || 'Untitled draft'}</Text>
        <View style={styles.chipRow}>
          <View style={styles.chip}><Ionicons name="create-outline" size={11} color={C.GOLD} /><Text style={[styles.chipTxt, { color: C.GOLD }]}>{STAGE_LABEL[item.stage]}</Text></View>
          <Text style={[styles.chipTxt, styles.dateTxt]}>edited {ago(item.updatedAt)}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => onDeleteDraft(item)} hitSlop={8} style={styles.actionBtn}>
        <Ionicons name="trash-outline" size={18} color={C.MUTED} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const showingDrafts = tab === 'drafts';
  // Split the creator's videos into upcoming (future release_date) vs already-published.
  const scheduledVideos = useMemo(() => videos.filter(isScheduled), [videos]);
  const publishedVideos = useMemo(() => videos.filter(v => !isScheduled(v)), [videos]);

  // Channel options for the filter — distinct channels across the creator's videos.
  const channelOptions = useMemo(() => {
    const m = new Map<string, string>();
    videos.forEach(v => m.set(v.channelId, v.channelName));
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [videos]);

  const activeFilterCount = (fStatus !== 'all' ? 1 : 0) + (fVis !== 'all' ? 1 : 0) + (fExcl !== 'all' ? 1 : 0) + (fChannel ? 1 : 0);

  const filteredVideos = useMemo(() => {
    let list = tab === 'scheduled' ? scheduledVideos : publishedVideos;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(v => v.title.toLowerCase().includes(q)
        || (v.collectionName?.toLowerCase().includes(q) ?? false)
        || v.channelName.toLowerCase().includes(q));
    }
    if (fStatus !== 'all') { list = list.filter(v => v.status === fStatus); }
    if (fVis !== 'all') { list = list.filter(v => v.visibility === fVis); }
    if (fExcl !== 'all') { list = list.filter(v => (fExcl === 'yes' ? v.isExclusive : !v.isExclusive)); }
    if (fChannel) { list = list.filter(v => v.channelId === fChannel); }
    return list;
  }, [tab, scheduledVideos, publishedVideos, search, fStatus, fVis, fExcl, fChannel]);

  const filteredDrafts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? drafts.filter(d => (d.title ?? '').toLowerCase().includes(q)) : drafts;
  }, [drafts, search]);

  const listData = showingDrafts ? filteredDrafts : filteredVideos;
  const resetFilters = () => { setFStatus('all'); setFVis('all'); setFExcl('all'); setFChannel(null); };

  const TABS = [
    { key: 'published' as const, label: 'Published' },
    // Scheduling is a Creator Studio feature — hide the Scheduled tab for everyone else.
    ...(isCreatorStudio
      ? [{ key: 'scheduled' as const, label: `Scheduled${scheduledVideos.length ? ` (${scheduledVideos.length})` : ''}` }]
      : []),
    { key: 'drafts' as const, label: `Drafts${drafts.length ? ` (${drafts.length})` : ''}` },
  ];

  return (
    <View style={styles.screen}>
    <CameraWarmup />
    <EffectWarmup />
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Studio</Text>
        <View style={styles.headerActions}>
          {isCreatorStudio && (
            <>
              <TouchableOpacity onPress={() => navigation.navigate('StudioCollections')} hitSlop={10}>
                <Ionicons name="diamond-outline" size={22} color={C.INK} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('StudioCalendar')} hitSlop={10}>
                <Ionicons name="calendar-outline" size={23} color={C.INK} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Published / Scheduled / Drafts toggle */}
      <View style={styles.toggle}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[styles.toggleBtn, tab === t.key && styles.toggleBtnOn]} onPress={() => setTab(t.key)} activeOpacity={0.85}>
            <Text style={[styles.toggleTxt, tab === t.key && styles.toggleTxtOn]} numberOfLines={1}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search + filter */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={C.SUBTLE} />
          <TextInput
            style={styles.searchInput} value={search} onChangeText={setSearch}
            placeholder="Search videos" placeholderTextColor={C.SUBTLE} autoCapitalize="none" returnKeyType="search"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}><Ionicons name="close-circle" size={16} color={C.SUBTLE} /></TouchableOpacity>
          )}
        </View>
        {!showingDrafts && (
          <TouchableOpacity style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnOn]} onPress={() => setFilterOpen(true)} activeOpacity={0.85}>
            <Ionicons name="funnel-outline" size={16} color={activeFilterCount > 0 ? C.WHITE : C.MUTED} />
            {activeFilterCount > 0 && <View style={styles.filterBadge}><Text style={styles.filterBadgeTxt}>{activeFilterCount}</Text></View>}
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={listData as any[]}
        keyExtractor={(v: any) => v.id}
        contentContainerStyle={listData.length === 0 ? styles.emptyWrap : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.ACCENT} />}
        ListEmptyComponent={loading
          ? <ActivityIndicator color={C.ACCENT} style={{ marginTop: SPACE.XXXL }} />
          : <Text style={styles.empty}>{
              search || activeFilterCount > 0
                ? 'No videos match your search/filters.'
                : tab === 'drafts'
                  ? 'No drafts. Recordings you don’t publish are saved here automatically.'
                  : tab === 'scheduled'
                    ? 'Nothing scheduled. Pick “Schedule” when posting a video.'
                    : 'No videos yet. Tap “New video” to create your first.'}</Text>}
        renderItem={showingDrafts ? (renderDraft as any) : (renderVideo as any)}
      />
    </View>

    {/* Filter sheet */}
    <Modal visible={filterOpen} animationType="slide" transparent onRequestClose={() => setFilterOpen(false)}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Filters</Text>
            <TouchableOpacity onPress={resetFilters} hitSlop={8}><Text style={styles.sheetReset}>Reset</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            <FilterGroup label="Status" value={fStatus} onChange={v => setFStatus(v as StatusFilter)}
              options={[['all', 'All'], ['ready', 'Live'], ['processing', 'Processing'], ['failed', 'Failed']]} />
            <FilterGroup label="Visibility" value={fVis} onChange={v => setFVis(v as VisFilter)}
              options={[['all', 'All'], ['public', 'Public'], ['subscribers', 'Members']]} />
            <FilterGroup label="Exclusive" value={fExcl} onChange={v => setFExcl(v as ExclFilter)}
              options={[['all', 'All'], ['yes', 'Exclusive'], ['no', 'Non-exclusive']]} />
            {channelOptions.length > 1 && (
              <FilterGroup label="Channel" value={fChannel ?? 'all'} onChange={v => setFChannel(v === 'all' ? null : v)}
                options={[['all', 'All'], ...channelOptions.map(c => [c.id, c.name] as [string, string])]} />
            )}
          </ScrollView>
          <TouchableOpacity style={styles.sheetDone} onPress={() => setFilterOpen(false)} activeOpacity={0.9}>
            <Text style={styles.sheetDoneTxt}>Show {filteredVideos.length} {filteredVideos.length === 1 ? 'video' : 'videos'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

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

// A labelled single-select chip group for the filter sheet.
function FilterGroup({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <View style={styles.fGroup}>
      <Text style={styles.fLabel}>{label}</Text>
      <View style={styles.fChips}>
        {options.map(([val, lbl]) => {
          const on = value === val;
          return (
            <TouchableOpacity key={val} style={[styles.fChip, on && styles.fChipOn]} onPress={() => onChange(val)} activeOpacity={0.85}>
              <Text style={[styles.fChipTxt, on && styles.fChipTxtOn]} numberOfLines={1}>{lbl}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG },
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.LG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.LG },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.LG },
  title: { fontSize: FONT.SIZES.XL, textTransform: 'uppercase', fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  toggle: {
    flexDirection: 'row', backgroundColor: C.SURFACE, borderRadius: RADIUS.FULL,
    padding: 3, borderWidth: 1, borderColor: C.BORDER,
  },
  toggleBtn: { flex: 1, alignItems: 'center', paddingVertical: SPACE.SM, borderRadius: RADIUS.FULL },
  toggleBtnOn: { backgroundColor: C.ACCENT },
  toggleTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  toggleTxtOn: { color: C.WHITE },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, marginTop: SPACE.SM },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.FULL, borderWidth: 1, borderColor: C.BORDER,
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS, justifyContent: 'center'
  },
  searchInput: { flex: 1, color: C.INK, fontFamily: FONT.BODY, fontSize: FONT.SIZES.SM, paddingVertical: SPACE.SM },
  filterBtn: { width: 40, height: 40, borderRadius: RADIUS.FULL, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE, alignItems: 'center', justifyContent: 'center' },
  filterBtnOn: { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
  filterBadge: { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: C.ACCENT_HOT, alignItems: 'center', justifyContent: 'center' },
  filterBadgeTxt: { color: C.WHITE, fontSize: 9, fontFamily: FONT.BODY_BOLD },

  list: { paddingTop: SPACE.MD, paddingBottom: SPACE.XXXL },
  emptyWrap: { flex: 1, alignItems: 'center', marginTop: '60%' },
  empty: { color: C.MUTED, fontFamily: FONT.BODY, textAlign: 'center', paddingHorizontal: SPACE.XL },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, padding: SPACE.SM, marginBottom: SPACE.SM,
    borderWidth: 1, borderColor: C.BORDER,
  },
  // Portrait 9:16 — studio videos are vertical, so the thumbnail/inline preview fills + centers.
  thumbWrap: { width: 67.5, height: 120, borderRadius: RADIUS.SM, backgroundColor: C.SURFACE_2, overflow: 'hidden' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  playPill: { position: 'absolute', left: 6, bottom: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  expandBtn: { position: 'absolute', right: 5, top: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },

  meta: { flex: 1 },
  rowTitle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4, gap: SPACE.SM },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 140 },
  exclChip: { },
  chipTxt: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM, color: C.SUBTLE },
  dateTxt: { color: C.SUBTLE, fontFamily: FONT.BODY },
  statusDot: { width: 7, height: 7, borderRadius: 4 },

  actions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { padding: SPACE.SM },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.SURFACE_2, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG, padding: SPACE.LG, paddingBottom: SPACE.XL, borderTopWidth: 1, borderColor: C.BORDER },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.SM },
  sheetTitle: { color: C.INK, fontFamily: FONT.DISPLAY_SEMIBOLD, fontSize: FONT.SIZES.LG },
  sheetReset: { color: C.ACCENT_HOT, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.SM },
  fGroup: { marginTop: SPACE.MD },
  fLabel: { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM, marginBottom: SPACE.SM },
  fChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.SM },
  fChip: { paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM, borderRadius: RADIUS.FULL, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE, maxWidth: 200 },
  fChipOn: { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
  fChipTxt: { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  fChipTxtOn: { color: C.WHITE },
  sheetDone: { marginTop: SPACE.LG, backgroundColor: C.ACCENT_HOT, borderRadius: RADIUS.MD, paddingVertical: SPACE.MD, alignItems: 'center' },
  sheetDoneTxt: { color: C.WHITE, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.MD },
});
