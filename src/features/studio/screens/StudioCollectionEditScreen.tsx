import { log } from '../../../infrastructure/logging/logger';
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
  Alert, Image, Modal, FlatList, Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { pickImage, pickVideoFromLibrary } from '../../../infrastructure/media/imagePicker';
import { fetchMyCreatorVideos, fetchPostableChannels, type MyCreatorVideo, type PostableChannel } from '../../../infrastructure/creatorStudio/api';
import { searchUsersByHandle, type UserHit } from '../../../infrastructure/supabase/queries/channels';
import {
  fetchCollectionById, createCollection, updateCollection, addVideoToCollection, removeVideoFromCollection,
  setCollectionTiers, fetchChannelTiers, awardCollectionsToUsers, uploadCollectionCover,
  publishCollection, scheduleCollection, cancelSchedule, type ChannelTier, type CollectionStatus,
} from '../../../infrastructure/exclusive/api';
import GradientButton from '../components/GradientButton';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

// "Tue, Jun 17 · 3:30 PM" in the device's locale/timezone.
const fmtSchedule = (d: Date) =>
  d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function StudioCollectionEditScreen({ route, navigation }: StudioStackScreenProps<'StudioCollectionEdit'>) {
  const editingId = route.params?.collectionId;
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [id, setId] = useState<string | undefined>(editingId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [channels, setChannels] = useState<PostableChannel[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverVideoUrl, setCoverVideoUrl] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);

  const [videos, setVideos] = useState<MyCreatorVideo[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [originalVideos, setOriginalVideos] = useState<Set<string>>(new Set());
  const [tiers, setTiers] = useState<ChannelTier[]>([]);
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set());

  const [awardOpen, setAwardOpen] = useState(false);

  // Delivery lifecycle of the collection itself (draft → scheduled → published).
  const [status, setStatus] = useState<CollectionStatus>('draft');
  const [publishAt, setPublishAt] = useState<string | null>(null);
  const [iosPickAt, setIosPickAt] = useState<Date | null>(null); // non-null → iOS schedule sheet open

  // Initial load: channels (for new), or the existing collection + its members/tiers (for edit).
  useEffect(() => {
    (async () => {
      if (!user?.id) { return; }
      try {
        const cs = await fetchPostableChannels(user.id);
        setChannels(cs);
        if (editingId) {
          const loaded = await fetchCollectionById(editingId);
          if (loaded) {
            setName(loaded.collection.name);
            setCoverUrl(loaded.collection.coverUrl);
            setCoverVideoUrl(loaded.collection.coverVideoUrl);
            setChannelId(loaded.collection.channelId);
            setSelectedVideos(new Set(loaded.videoIds));
            setOriginalVideos(new Set(loaded.videoIds));
            setSelectedTiers(new Set(loaded.tierIds));
            setStatus(loaded.collection.status);
            setPublishAt(loaded.collection.publishAt);
          }
        } else {
          setChannelId(cs[0]?.id ?? null);
        }
      } catch (e) { log.error('[studio] collection load', e); }
      finally { setLoading(false); }
    })();
  }, [user?.id, editingId]);

  // Whenever the channel changes, load that channel's ready videos + tiers.
  useEffect(() => {
    if (!user?.id || !channelId) { return; }
    fetchMyCreatorVideos(user.id)
      .then(vs => setVideos(vs.filter(v => v.channelId === channelId)))
      .catch(() => {});
    fetchChannelTiers(channelId).then(setTiers).catch(() => {});
  }, [user?.id, channelId]);

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  };

  const pickCover = () => {
    Alert.alert('Cover', 'Set a photo or short video as this collection’s cover.', [
      { text: 'Photo', onPress: () => doPickCover('image') },
      { text: 'Video', onPress: () => doPickCover('video') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const doPickCover = async (kind: 'image' | 'video') => {
    try {
      const picked = kind === 'image' ? await pickImage() : await pickVideoFromLibrary();
      if (!picked?.uri) { return; }
      setCoverBusy(true);
      const url = await uploadCollectionCover(picked.uri, kind);
      if (kind === 'image') { setCoverUrl(url); } else { setCoverVideoUrl(url); }
    } catch (e: any) { Alert.alert('Cover failed', e?.message ?? 'Try again.'); }
    finally { setCoverBusy(false); }
  };

  // Persist the collection (create/update + video membership + tier grants) WITHOUT navigating away, and
  // return its id. Shared by Save and the delivery actions (so a publish/schedule always sends the latest
  // tier selection — the edge fn reads collection_tier_grants to find recipients).
  const persist = async (): Promise<string> => {
    if (!user?.id || !channelId) { throw new Error('Pick a channel first.'); }
    if (!name.trim()) { throw new Error('Name your collection first.'); }
    let cid = id;
    if (!cid) {
      const created = await createCollection({ channelId, creatorId: user.id, name: name.trim(), coverUrl, coverVideoUrl });
      cid = created.id;
      setId(cid);
    } else {
      await updateCollection(cid, { name: name.trim(), coverUrl, coverVideoUrl });
    }
    const adds = [...selectedVideos].filter(v => !originalVideos.has(v));
    const removes = [...originalVideos].filter(v => !selectedVideos.has(v));
    for (const p of adds) { await addVideoToCollection(cid, p); }
    for (const p of removes) { await removeVideoFromCollection(cid, p); }
    setOriginalVideos(new Set(selectedVideos));
    await setCollectionTiers(cid, [...selectedTiers]);
    return cid;
  };

  const save = async () => {
    setSaving(true);
    try { await persist(); navigation.goBack(); }
    catch (e: any) { Alert.alert('Save failed', e?.message ?? 'Try again.'); setSaving(false); }
  };

  // ── Delivery ──
  const deliverNow = async () => {
    if (selectedTiers.size === 0) {
      Alert.alert('No tiers selected', 'Pick at least one membership tier above so subscribers receive this collection. (Use “Award to people” to send it to specific fans.)');
      return;
    }
    setSaving(true);
    try {
      const cid = await persist();
      const n = await publishCollection(cid);
      setStatus('published'); setPublishAt(null);
      Alert.alert('Sent 🎁', n > 0
        ? `Delivered to ${n} subscriber${n === 1 ? '' : 's'}. New members will get it automatically.`
        : 'No new subscribers to deliver to right now — current members already have it, and new members will get it automatically.');
    } catch (e: any) { Alert.alert('Could not send', e?.message ?? 'Try again.'); }
    finally { setSaving(false); }
  };

  const doSchedule = async (at: Date) => {
    if (at.getTime() <= Date.now()) { Alert.alert('Pick a future time', 'The scheduled time must be in the future.'); return; }
    if (selectedTiers.size === 0) {
      Alert.alert('No tiers selected', 'Pick at least one membership tier above so subscribers receive this collection.');
      return;
    }
    setSaving(true);
    try {
      const cid = await persist();
      await scheduleCollection(cid, at.toISOString());
      setStatus('scheduled'); setPublishAt(at.toISOString());
      Alert.alert('Scheduled 🗓️', `Goes out ${fmtSchedule(at)}.`);
    } catch (e: any) { Alert.alert('Could not schedule', e?.message ?? 'Try again.'); }
    finally { setSaving(false); }
  };

  const openSchedule = () => {
    const base = publishAt ? new Date(publishAt) : new Date(Date.now() + 60 * 60 * 1000);
    if (Platform.OS === 'ios') { setIosPickAt(base); return; }
    DateTimePickerAndroid.open({
      value: base, mode: 'date', minimumDate: new Date(),
      onChange: (_e, d) => {
        if (!d) { return; }
        DateTimePickerAndroid.open({
          value: d, mode: 'time', is24Hour: false,
          onChange: (_e2, t) => {
            if (!t) { return; }
            const c = new Date(d); c.setHours(t.getHours(), t.getMinutes(), 0, 0); doSchedule(c);
          },
        });
      },
    });
  };

  const doCancelSchedule = async () => {
    if (!id) { return; }
    setSaving(true);
    try { await cancelSchedule(id); setStatus('draft'); setPublishAt(null); }
    catch (e: any) { Alert.alert('Failed', e?.message ?? 'Try again.'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <View style={[styles.container, styles.center, { paddingTop: top }]}><ActivityIndicator color={C.ACCENT} /></View>;
  }

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={C.INK} /></TouchableOpacity>
        <Text style={styles.title}>{editingId ? 'Edit collection' : 'New collection'}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Cover */}
        <View style={styles.coverRow}>
          <TouchableOpacity style={styles.coverBox} onPress={pickCover} activeOpacity={0.85} disabled={coverBusy}>
            {coverBusy ? <ActivityIndicator color={C.ACCENT} />
              : coverUrl ? <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                : <><Ionicons name="image-outline" size={22} color={C.SUBTLE} /><Text style={styles.coverHint}>Cover</Text></>}
            {coverVideoUrl && <View style={styles.videoBadge}><Ionicons name="videocam" size={12} color={C.WHITE} /></View>}
          </TouchableOpacity>
          <View style={{ flex: 1, gap: SPACE.SM }}>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Behind the Scenes" placeholderTextColor={C.SUBTLE} maxLength={80} />
          </View>
        </View>
        <Text style={styles.coverNote}>Tap the cover to set a photo or video.</Text>

        {/* Channel (only when creating; locked on edit) */}
        {!editingId && (
          <>
            <Text style={styles.section}>Channel</Text>
            {channels.map(ch => {
              const on = ch.id === channelId;
              return (
                <TouchableOpacity key={ch.id} style={[styles.choice, on && styles.choiceOn]} onPress={() => setChannelId(ch.id)} activeOpacity={0.8}>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? C.ACCENT_HOT : C.SUBTLE} />
                  <Text style={styles.choiceTxt} numberOfLines={1}>{ch.name}</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Videos */}
        <Text style={styles.section}>Videos {selectedVideos.size > 0 ? `(${selectedVideos.size})` : ''}</Text>
        <Text style={styles.hint}>Adding a video makes it exclusive — it leaves the regular channel feed.</Text>
        {videos.length === 0
          ? <Text style={styles.empty}>No ready videos in this channel yet.</Text>
          : videos.map(v => {
              const on = selectedVideos.has(v.id);
              return (
                <TouchableOpacity key={v.id} style={[styles.vrow, on && styles.vrowOn]} onPress={() => setSelectedVideos(s => toggle(s, v.id))} activeOpacity={0.8}>
                  {v.thumbnail ? <Image source={{ uri: v.thumbnail }} style={styles.vthumb} /> : <View style={[styles.vthumb, styles.center]}><Ionicons name="film-outline" size={16} color={C.SUBTLE} /></View>}
                  <Text style={styles.vtitle} numberOfLines={1}>{v.title}</Text>
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? C.ACCENT_HOT : C.SUBTLE} />
                </TouchableOpacity>
              );
            })}

        {/* Tiers */}
        <Text style={styles.section}>Award to tiers</Text>
        <Text style={styles.hint}>Members of a selected tier get this collection automatically.</Text>
        {tiers.length === 0
          ? <Text style={styles.empty}>This channel has no membership tiers yet.</Text>
          : tiers.map(t => {
              const on = selectedTiers.has(t.id);
              return (
                <TouchableOpacity key={t.id} style={[styles.choice, on && styles.choiceOn]} onPress={() => setSelectedTiers(s => toggle(s, t.id))} activeOpacity={0.8}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? C.ACCENT_HOT : C.SUBTLE} />
                  <Text style={styles.choiceTxt}>{t.title}</Text>
                </TouchableOpacity>
              );
            })}

        {/* Individual award (existing collections only) */}
        <Text style={styles.section}>Award to people</Text>
        {id
          ? (
            <TouchableOpacity style={styles.awardBtn} onPress={() => setAwardOpen(true)} activeOpacity={0.85}>
              <Ionicons name="gift-outline" size={18} color={C.ACCENT_HOT} />
              <Text style={styles.awardTxt}>Award to specific people…</Text>
            </TouchableOpacity>
          )
          : <Text style={styles.empty}>Save the collection first to award it to individual people.</Text>}

        {/* Delivery — send the collection to all current tier subscribers now, or schedule it. */}
        <Text style={styles.section}>Delivery</Text>
        {!id ? (
          <Text style={styles.empty}>Save the collection first to send or schedule it.</Text>
        ) : (
          <>
            <View style={styles.statusBanner}>
              <Ionicons
                name={status === 'published' ? 'checkmark-circle' : status === 'scheduled' ? 'time' : 'ellipse-outline'}
                size={16} color={status === 'published' ? '#2DD4BF' : C.ACCENT_HOT} />
              <Text style={styles.statusTxt}>
                {status === 'published' ? 'Published — subscribers have it'
                  : status === 'scheduled' ? `Scheduled for ${publishAt ? fmtSchedule(new Date(publishAt)) : '—'}`
                  : 'Draft — not sent to subscribers yet'}
              </Text>
            </View>
            <View style={styles.deliverRow}>
              <TouchableOpacity style={styles.deliverBtn} onPress={openSchedule} disabled={saving} activeOpacity={0.85}>
                <Ionicons name="calendar-outline" size={18} color={C.INK} />
                <Text style={styles.deliverTxt}>{status === 'scheduled' ? 'Reschedule' : 'Schedule'}</Text>
              </TouchableOpacity>
              {status === 'scheduled' && (
                <TouchableOpacity style={styles.deliverBtn} onPress={doCancelSchedule} disabled={saving} activeOpacity={0.85}>
                  <Ionicons name="close-circle-outline" size={18} color={C.INK} />
                  <Text style={styles.deliverTxt}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={deliverNow} disabled={saving} activeOpacity={0.9} style={{ marginTop: SPACE.SM }}>
              <View style={styles.sendNow}>
                <Ionicons name="gift" size={17} color={C.WHITE} />
                <Text style={styles.sendNowTxt}>{status === 'published' ? 'Send to current tiers' : 'Send to tiers now'}</Text>
              </View>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton label={saving ? 'Saving…' : editingId ? 'Save' : 'Create collection'} onPress={save} disabled={saving} />
      </View>

      {id && <AwardModal visible={awardOpen} onClose={() => setAwardOpen(false)} collectionId={id} selfId={user?.id} />}

      {/* iOS schedule picker (Android uses the native dialogs from openSchedule). */}
      {Platform.OS === 'ios' && (
        <Modal visible={!!iosPickAt} animationType="slide" transparent onRequestClose={() => setIosPickAt(null)}>
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Schedule delivery</Text>
                <TouchableOpacity onPress={() => { const at = iosPickAt; setIosPickAt(null); if (at) { doSchedule(at); } }} hitSlop={10}>
                  <Text style={styles.pickerDone}>Save</Text>
                </TouchableOpacity>
              </View>
              {iosPickAt && (
                <DateTimePicker value={iosPickAt} mode="datetime" display="spinner" minimumDate={new Date()} themeVariant="dark"
                  onChange={(_e, d) => { if (d) { setIosPickAt(d); } }} />
              )}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// Search people by handle and award the collection to them immediately.
function AwardModal({ visible, onClose, collectionId, selfId }: { visible: boolean; onClose: () => void; collectionId: string; selfId?: string }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [chosen, setChosen] = useState<Record<string, UserHit>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      searchUsersByHandle(q, selfId).then(r => { if (!cancelled) { setHits(r); } }).catch(() => {});
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, selfId]);

  const award = async () => {
    const ids = Object.keys(chosen);
    if (!ids.length) { return; }
    setBusy(true);
    try {
      await awardCollectionsToUsers([collectionId], ids);
      Alert.alert('Awarded 🎁', `Sent to ${ids.length} ${ids.length === 1 ? 'person' : 'people'}.`);
      setChosen({}); setQ(''); onClose();
    } catch (e: any) { Alert.alert('Award failed', e?.message ?? 'Try again.'); }
    finally { setBusy(false); }
  };

  const chosenList = Object.values(chosen);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Award collection</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color={C.INK} /></TouchableOpacity>
          </View>
          <TextInput style={styles.input} value={q} onChangeText={setQ} placeholder="Search by @handle or name" placeholderTextColor={C.SUBTLE} autoCapitalize="none" />
          {chosenList.length > 0 && (
            <Text style={styles.chosenLine}>{chosenList.map(u => `@${u.handle}`).join(', ')}</Text>
          )}
          <FlatList
            style={{ maxHeight: 280 }}
            data={hits}
            keyExtractor={u => u.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const on = !!chosen[item.id];
              return (
                <TouchableOpacity style={styles.hit} onPress={() => setChosen(c => { const n = { ...c }; on ? delete n[item.id] : (n[item.id] = item); return n; })} activeOpacity={0.8}>
                  {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.hitAv} /> : <View style={[styles.hitAv, styles.center]}><Text style={styles.hitInitial}>{item.displayName[0]?.toUpperCase()}</Text></View>}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hitName} numberOfLines={1}>{item.displayName}</Text>
                    <Text style={styles.hitHandle} numberOfLines={1}>@{item.handle}</Text>
                  </View>
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? C.ACCENT_HOT : C.SUBTLE} />
                </TouchableOpacity>
              );
            }}
          />
          <GradientButton label={busy ? 'Awarding…' : `Award to ${chosenList.length || ''}`.trim()} onPress={award} disabled={busy || chosenList.length === 0} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.LG },
  center:    { alignItems: 'center', justifyContent: 'center' },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.MD },
  title:     { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  body:      { paddingBottom: SPACE.XXXL },

  coverRow:  { flexDirection: 'row', gap: SPACE.MD, alignItems: 'flex-start' },
  coverBox:  { width: 92, height: 92, borderRadius: RADIUS.MD, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  coverHint: { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.XS, marginTop: 2 },
  videoBadge:{ position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: 3 },
  coverNote: { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.XS, marginTop: SPACE.SM },

  label:   { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  input:   { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM, color: C.INK, fontFamily: FONT.BODY, fontSize: FONT.SIZES.MD },
  section: { color: C.INK, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.MD, marginTop: SPACE.LG, marginBottom: SPACE.XS },
  hint:    { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.XS, marginBottom: SPACE.SM },
  empty:   { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.SM, marginBottom: SPACE.SM },

  choice:    { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER, borderRadius: RADIUS.MD, paddingVertical: SPACE.MD, paddingHorizontal: SPACE.MD, marginBottom: SPACE.SM },
  choiceOn:  { borderColor: C.ACCENT },
  choiceTxt: { flex: 1, color: C.INK, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.SM },

  vrow:    { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER, borderRadius: RADIUS.MD, padding: SPACE.SM, marginBottom: SPACE.SM },
  vrowOn:  { borderColor: C.ACCENT },
  vthumb:  { width: 44, height: 44, borderRadius: RADIUS.SM, backgroundColor: C.SURFACE_2 },
  vtitle:  { flex: 1, color: C.INK, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.SM },

  awardBtn:{ flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.ACCENT_LITE, borderRadius: RADIUS.MD, padding: SPACE.MD },
  awardTxt:{ color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },

  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER, borderRadius: RADIUS.MD, padding: SPACE.MD, marginBottom: SPACE.SM },
  statusTxt:    { flex: 1, color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  deliverRow:   { flexDirection: 'row', gap: SPACE.SM },
  deliverBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER, borderRadius: RADIUS.MD, paddingVertical: SPACE.MD },
  deliverTxt:   { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  sendNow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.ACCENT_HOT, borderRadius: RADIUS.MD, paddingVertical: SPACE.MD },
  sendNowTxt:   { color: C.WHITE, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.SM },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet:   { backgroundColor: C.SURFACE_2, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG, paddingBottom: SPACE.XL, borderTopWidth: 1, borderColor: C.BORDER },
  pickerHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACE.LG },
  pickerTitle:   { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },
  pickerDone:    { color: C.ACCENT_HOT, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.MD },

  footer:  { paddingVertical: SPACE.SM, marginBottom: 50 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: C.SURFACE_2, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG, padding: SPACE.LG, paddingBottom: SPACE.XL, gap: SPACE.SM },
  modalHead:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle:   { color: C.INK, fontFamily: FONT.DISPLAY_SEMIBOLD, fontSize: FONT.SIZES.MD },
  chosenLine:   { color: C.ACCENT_HOT, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.XS },
  hit:     { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, paddingVertical: SPACE.SM },
  hitAv:   { width: 40, height: 40, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE },
  hitInitial: { color: C.INK, fontFamily: FONT.BODY_BOLD },
  hitName: { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  hitHandle: { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.XS },
});
