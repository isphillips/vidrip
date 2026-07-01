import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import {
  fetchCreatorVideoForEdit, updateCreatorVideo, reschedulePost, unschedulePost, type Visibility,
} from '../../../infrastructure/creatorStudio/api';
import {
  fetchMyCollections, addVideoToCollection, removeVideoFromCollection, setPostExclusive,
  type ExclusiveCollection,
} from '../../../infrastructure/exclusive/api';
import { findObjectionable, OBJECTIONABLE_MESSAGE } from '../../../infrastructure/moderation/textFilter';
import { MONETIZATION_ENABLED } from '../../../infrastructure/config/monetization';
import GradientButton from '../components/GradientButton';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

const fmtSchedule = (d: Date) =>
  d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function StudioVideoEditScreen({ route, navigation }: StudioStackScreenProps<'StudioVideoEdit'>) {
  const { postId } = route.params;
  const { top } = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [membersOnly, setMembersOnly] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);

  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now');
  const [releaseAt, setReleaseAt] = useState<Date>(() => new Date(Date.now() + 60 * 60 * 1000));
  const [wasScheduled, setWasScheduled] = useState(false);
  const [iosPicker, setIosPicker] = useState(false);

  const [exclusiveOn, setExclusiveOn] = useState(false);
  const [collections, setCollections] = useState<ExclusiveCollection[]>([]);
  const [collectionId, setCollectionId] = useState<string | null>(null);   // selected
  const [origCollectionId, setOrigCollectionId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const v = await fetchCreatorVideoForEdit(postId);
        if (!v) { Alert.alert('Not found', 'This video could not be loaded.'); navigation.goBack(); return; }
        setTitle(v.title);
        setVisibility(v.visibility);
        setMembersOnly(v.isMembersOnly);
        setChannelId(v.channelId);
        setExclusiveOn(v.isExclusive);
        setCollectionId(v.collectionId);
        setOrigCollectionId(v.collectionId);
        const scheduled = !!v.releaseDate && new Date(v.releaseDate).getTime() > Date.now();
        setWasScheduled(scheduled);
        if (scheduled) { setPublishMode('schedule'); setReleaseAt(new Date(v.releaseDate!)); }
        fetchMyCollections(v.channelId).then(setCollections).catch(() => {});
      } catch (e: any) {
        Alert.alert('Couldn’t load', e?.message ?? 'Try again.'); navigation.goBack();
      } finally { setLoading(false); }
    })();
  }, [postId, navigation]);

  const pickSchedule = () => {
    if (Platform.OS === 'ios') { setIosPicker(true); return; }
    DateTimePickerAndroid.open({
      value: releaseAt, mode: 'date', minimumDate: new Date(),
      onChange: (_e, d) => {
        if (!d) { return; }
        DateTimePickerAndroid.open({
          value: d, mode: 'time', is24Hour: false,
          onChange: (_e2, t) => {
            if (!t) { return; }
            const c = new Date(d); c.setHours(t.getHours(), t.getMinutes(), 0, 0); setReleaseAt(c);
          },
        });
      },
    });
  };

  const save = async () => {
    if (saving) { return; }
    if (findObjectionable(title)) { Alert.alert('Edit your title', OBJECTIONABLE_MESSAGE); return; }
    const scheduling = publishMode === 'schedule';
    if (scheduling && releaseAt.getTime() <= Date.now()) {
      Alert.alert('Pick a future time', 'The scheduled time must be in the future.'); return;
    }
    if (exclusiveOn && !collectionId && collections.length > 0) {
      Alert.alert('Pick a collection', 'Choose which exclusive collection this video belongs to (or turn Exclusive off).'); return;
    }
    setSaving(true);
    try {
      // Title + visibility (members-only channels force subscribers).
      await updateCreatorVideo(postId, { title: title.trim() || 'Untitled', visibility: membersOnly ? 'subscribers' : visibility });

      // Schedule.
      if (scheduling) { await reschedulePost(postId, releaseAt.toISOString()); }
      else if (wasScheduled) { await unschedulePost(postId); }

      // Exclusive / collection membership.
      if (exclusiveOn) {
        if (collectionId && collectionId !== origCollectionId) {
          if (origCollectionId) { await removeVideoFromCollection(origCollectionId, postId); }
          await addVideoToCollection(collectionId, postId);   // also sets is_exclusive=true
        } else if (!collectionId) {
          if (origCollectionId) { await removeVideoFromCollection(origCollectionId, postId); }
          await setPostExclusive(postId, true);
        }
      } else {
        if (origCollectionId) { await removeVideoFromCollection(origCollectionId, postId); }
        await setPostExclusive(postId, false);
      }

      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Try again.'); setSaving(false);
    }
  };

  if (loading) {
    return <View style={[styles.container, styles.center, { paddingTop: top }]}><ActivityIndicator color={C.ACCENT} /></View>;
  }

  const visLocked = membersOnly;

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={C.INK} /></TouchableOpacity>
        <Text style={styles.title}>Edit video</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Give it a title…" placeholderTextColor={C.SUBTLE} maxLength={120} />

        {/* Members-only visibility is a paid surface — hidden while monetization is off (App Store 3.1.1). */}
        {MONETIZATION_ENABLED && (
        <>
        <Text style={styles.label}>Who can watch</Text>
        {visLocked && <Text style={styles.hint}>This channel is members-only. All posts are locked to members.</Text>}
        <View style={styles.toggle}>
          {(['public', 'subscribers'] as Visibility[]).map(v => {
            const active = (membersOnly ? 'subscribers' : visibility) === v;
            const disabled = v === 'public' && visLocked;
            return (
              <TouchableOpacity key={v}
                style={[styles.toggleBtn, active && styles.toggleBtnOn, disabled && styles.toggleBtnDisabled]}
                onPress={() => { if (!disabled) { setVisibility(v); } }} activeOpacity={disabled ? 1 : 0.85}>
                <Ionicons name={v === 'public' ? 'globe-outline' : 'lock-closed'} size={16} color={active ? C.WHITE : disabled ? C.SUBTLE : C.MUTED} />
                <Text style={[styles.toggleTxt, active && styles.toggleTxtOn]}>{v === 'public' ? 'Public' : 'Members'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        </>
        )}

        <Text style={styles.label}>When to publish</Text>
        <View style={styles.toggle}>
          {([['now', 'Live now', 'flash-outline'], ['schedule', 'Schedule', 'calendar-outline']] as const).map(([m, lbl, icon]) => {
            const active = publishMode === m;
            return (
              <TouchableOpacity key={m} style={[styles.toggleBtn, active && styles.toggleBtnOn]} onPress={() => setPublishMode(m)} activeOpacity={0.85}>
                <Ionicons name={icon} size={16} color={active ? C.WHITE : C.MUTED} />
                <Text style={[styles.toggleTxt, active && styles.toggleTxtOn]}>{lbl}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {publishMode === 'schedule' && (
          <TouchableOpacity style={styles.scheduleField} onPress={pickSchedule} activeOpacity={0.85}>
            <Ionicons name="time-outline" size={18} color={C.ACCENT_HOT} />
            <Text style={styles.scheduleTxt}>{fmtSchedule(releaseAt)}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.SUBTLE} />
          </TouchableOpacity>
        )}

        {/* Exclusive (members-only) publishing is a paid surface — hidden while monetization is off
            (App Store 3.1.1). exclusiveOn stays as loaded, so the save leaves the post as-is. */}
        {MONETIZATION_ENABLED && (
        <>
        <Text style={styles.label}>Exclusive</Text>
        <TouchableOpacity style={styles.exclToggle} onPress={() => setExclusiveOn(o => !o)} activeOpacity={0.85}>
          <Ionicons name={exclusiveOn ? 'diamond' : 'diamond-outline'} size={18} color={exclusiveOn ? C.ACCENT_HOT : C.SUBTLE} />
          <Text style={styles.exclTxt}>{exclusiveOn ? 'Exclusive — hidden from the public feed' : 'Public video (not exclusive)'}</Text>
          <View style={[styles.switch, exclusiveOn && styles.switchOn]}><View style={[styles.knob, exclusiveOn && styles.knobOn]} /></View>
        </TouchableOpacity>

        {exclusiveOn && (
          <>
            <Text style={styles.subLabel}>Collection</Text>
            {collections.length === 0
              ? <Text style={styles.hint}>No collections in this channel yet. Create one in Collections.</Text>
              : collections.map(c => {
                  const on = collectionId === c.id;
                  return (
                    <TouchableOpacity key={c.id} style={[styles.choice, on && styles.choiceOn]} onPress={() => setCollectionId(c.id)} activeOpacity={0.85}>
                      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? C.ACCENT_HOT : C.SUBTLE} />
                      <Text style={styles.choiceTxt} numberOfLines={1}>{c.name}</Text>
                      {c.status !== 'published' && <Text style={styles.choiceBadge}>{c.status === 'scheduled' ? 'Scheduled' : 'Draft'}</Text>}
                    </TouchableOpacity>
                  );
                })}
          </>
        )}
        </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton label={saving ? 'Saving…' : 'Save changes'} onPress={save} disabled={saving} />
      </View>

      {Platform.OS === 'ios' && (
        <Modal visible={iosPicker} animationType="slide" transparent onRequestClose={() => setIosPicker(false)}>
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Schedule for</Text>
                <TouchableOpacity onPress={() => setIosPicker(false)} hitSlop={10}><Text style={styles.pickerDone}>Done</Text></TouchableOpacity>
              </View>
              <DateTimePicker value={releaseAt} mode="datetime" display="spinner" minimumDate={new Date()} themeVariant="dark"
                onChange={(_e, d) => { if (d) { setReleaseAt(d); } }} />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.LG },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.MD },
  title: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  body: { paddingBottom: SPACE.XXXL },

  label: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED, marginTop: SPACE.MD, marginBottom: SPACE.SM },
  subLabel: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_SEMIBOLD, color: C.SUBTLE, marginTop: SPACE.SM, marginBottom: SPACE.XS },
  input: { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, padding: SPACE.LG, fontSize: FONT.SIZES.MD, color: C.INK, fontFamily: FONT.BODY },
  hint: { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.SM, marginBottom: SPACE.SM },

  toggle: { flexDirection: 'row', gap: SPACE.SM },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.SM, paddingVertical: SPACE.MD, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE },
  toggleBtnOn: { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
  toggleBtnDisabled: { opacity: 0.35 },
  toggleTxt: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  toggleTxtOn: { color: C.WHITE },

  scheduleField: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, marginTop: SPACE.SM, backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.ACCENT_LITE, paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG },
  scheduleTxt: { flex: 1, color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },

  exclToggle: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, padding: SPACE.MD },
  exclTxt: { flex: 1, color: C.INK, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.SM },
  switch: { width: 42, height: 26, borderRadius: 13, backgroundColor: C.SURFACE_2, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: C.ACCENT_HOT },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.WHITE },
  knobOn: { alignSelf: 'flex-end' },

  choice: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER, borderRadius: RADIUS.MD, paddingVertical: SPACE.MD, paddingHorizontal: SPACE.MD, marginBottom: SPACE.SM },
  choiceOn: { borderColor: C.ACCENT },
  choiceTxt: { flex: 1, color: C.INK, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.SM },
  choiceBadge: { color: C.ACCENT_HOT, fontFamily: FONT.BODY_SEMIBOLD, fontSize: 10 },

  footer: { paddingVertical: SPACE.SM, marginBottom: SPACE.XL },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: C.SURFACE_2, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG, paddingBottom: SPACE.XL, borderTopWidth: 1, borderColor: C.BORDER },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACE.LG },
  pickerTitle: { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },
  pickerDone: { color: C.ACCENT_HOT, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.MD },
});
