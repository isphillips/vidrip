import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, Platform, Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchScheduledPosts, reschedulePost, unschedulePost, type ScheduledPost,
} from '../../../infrastructure/creatorStudio/api';
import BunnyEmbedPlayer from '../components/BunnyEmbedPlayer';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const FLOW = ['#FF4FA3', '#A05CFF', '#2DD4BF'];
// Distinct bar colors keyed off the channel so a creator can tell channels apart at a glance.
const BAR_COLORS = ['#FF4FA3', '#A05CFF', '#2DD4BF', '#FFB000', '#3AE3FF', '#FF7A4F'];
const colorFor = (channelId: string) => {
  let h = 0;
  for (let i = 0; i < channelId.length; i++) { h = (h * 31 + channelId.charCodeAt(i)) >>> 0; }
  return BAR_COLORS[h % BAR_COLORS.length];
};
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const fmtFull = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// 6×7 grid of Date|null for the month containing `cursor`.
function monthMatrix(cursor: Date): (Date | null)[][] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysIn = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) { cells.push(null); }
  for (let d = 1; d <= daysIn; d++) { cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d)); }
  while (cells.length % 7 !== 0) { cells.push(null); }
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) { weeks.push(cells.slice(i, i + 7)); }
  return weeks;
}

export default function StudioCalendarScreen({ navigation }: StudioStackScreenProps<'StudioCalendar'>) {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [cursor, setCursor] = useState(() => new Date());
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ScheduledPost | null>(null);
  const [playing, setPlaying] = useState(false);
  const [iosPickAt, setIosPickAt] = useState<Date | null>(null); // non-null → iOS reschedule sheet open

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try { setPosts(await fetchScheduledPosts(user.id)); }
    catch (e) { console.error('[studio] calendar load', e); }
    finally { setLoading(false); }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Group posts by local day for the grid.
  const byDay = new Map<string, ScheduledPost[]>();
  for (const p of posts) {
    const k = dayKey(new Date(p.releaseDate));
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(p);
  }

  const shiftMonth = (delta: number) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  const todayKey = dayKey(new Date());
  const weeks = monthMatrix(cursor);

  const applyReschedule = async (postId: string, at: Date) => {
    if (at.getTime() <= Date.now()) { Alert.alert('Pick a future time', 'The scheduled time must be in the future.'); return; }
    try {
      await reschedulePost(postId, at.toISOString());
      setSelected(null);
      await load();
    } catch (e: any) { Alert.alert('Could not reschedule', e?.message ?? 'Try again.'); }
  };

  const startReschedule = (post: ScheduledPost) => {
    const current = new Date(post.releaseDate);
    if (Platform.OS === 'ios') { setIosPickAt(current); return; }
    DateTimePickerAndroid.open({
      value: current, mode: 'date', minimumDate: new Date(),
      onChange: (_e, d) => {
        if (!d) { return; }
        DateTimePickerAndroid.open({
          value: d, mode: 'time', is24Hour: false,
          onChange: (_e2, t) => {
            if (!t) { return; }
            const combined = new Date(d);
            combined.setHours(t.getHours(), t.getMinutes(), 0, 0);
            applyReschedule(post.id, combined);
          },
        });
      },
    });
  };

  const cancelSchedule = (post: ScheduledPost) => {
    Alert.alert('Publish now?', 'This removes the schedule and makes the video go live immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Publish now', style: 'destructive', onPress: async () => {
          try { await unschedulePost(post.id); setSelected(null); await load(); }
          catch (e: any) { Alert.alert('Failed', e?.message ?? 'Try again.'); }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={C.INK} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Schedule</Text>
          <Text style={styles.subtitle}>{posts.length ? `${posts.length} upcoming` : 'Plan your drops'}</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.card}>
        {/* Month nav */}
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={10} style={styles.navBtn}><Ionicons name="chevron-back" size={20} color={C.INK} /></TouchableOpacity>
          <TouchableOpacity onPress={() => setCursor(new Date())} activeOpacity={0.7}>
            <Text style={styles.monthLabel}>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={10} style={styles.navBtn}><Ionicons name="chevron-forward" size={20} color={C.INK} /></TouchableOpacity>
        </View>

        <View style={styles.weekdays}>
          {WEEKDAYS.map((d, i) => <Text key={i} style={styles.weekday}>{d}</Text>)}
        </View>

        {loading ? (
          <ActivityIndicator color={C.ACCENT_HOT} style={{ marginVertical: SPACE.XXXL }} />
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: SPACE.MD }}>
            {weeks.map((week, wi) => (
              <View key={wi} style={styles.week}>
                {week.map((date, di) => {
                  if (!date) { return <View key={di} style={styles.cell} />; }
                  const k = dayKey(date);
                  const dayPosts = byDay.get(k) ?? [];
                  const isToday = k === todayKey;
                  return (
                    <View key={di} style={[styles.cell, dayPosts.length > 0 && styles.cellActive]}>
                      {isToday
                        ? <View style={styles.todayPill}><Text style={styles.todayNum}>{date.getDate()}</Text></View>
                        : <Text style={styles.dayNum}>{date.getDate()}</Text>}
                      {dayPosts.slice(0, 3).map(p => (
                        <TouchableOpacity key={p.id} style={[styles.bar, { backgroundColor: colorFor(p.channelId) }]}
                          onPress={() => { setSelected(p); setPlaying(false); }} activeOpacity={0.85}>
                          <Text style={styles.barText} numberOfLines={1}>{fmtTime(p.releaseDate)}</Text>
                        </TouchableOpacity>
                      ))}
                      {dayPosts.length > 3 && <Text style={styles.more}>+{dayPosts.length - 3} more</Text>}
                    </View>
                  );
                })}
              </View>
            ))}
            {posts.length === 0 && (
              <View style={styles.emptyWrap}>
                <Ionicons name="calendar-outline" size={34} color={C.SUBTLE} />
                <Text style={styles.empty}>No scheduled posts yet.</Text>
                <Text style={styles.emptyHint}>Choose “Schedule” when posting a video.</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Detail / view modal */}
      <Modal visible={!!selected} animationType="fade" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            {selected && (
              <>
                <View style={styles.sheetHead}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>{selected.title}</Text>
                  <TouchableOpacity onPress={() => setSelected(null)} hitSlop={10}><Ionicons name="close" size={22} color={C.INK} /></TouchableOpacity>
                </View>
                <View style={styles.sheetWhen}>
                  <Ionicons name="time-outline" size={15} color={C.ACCENT_HOT} />
                  <Text style={styles.sheetWhenTxt}>{fmtFull(selected.releaseDate)}</Text>
                </View>
                <View style={styles.preview}>
                  {playing && selected.status === 'ready' ? (
                    <BunnyEmbedPlayer postId={selected.id} title={selected.title} onClose={() => setPlaying(false)} />
                  ) : selected.thumbnail ? (
                    <Image source={{ uri: selected.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.previewEmpty]}><Ionicons name="film-outline" size={28} color={C.SUBTLE} /></View>
                  )}
                  {!playing && (
                    <TouchableOpacity style={styles.playBtn} onPress={() => setPlaying(true)} disabled={selected.status !== 'ready'} activeOpacity={0.85}>
                      <View style={styles.playBg}>
                        <Ionicons name={selected.status === 'ready' ? 'play' : 'hourglass-outline'} size={22} color="#fff" />
                      </View>
                      {selected.status !== 'ready' && <Text style={styles.processing}>Still encoding…</Text>}
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.sheetActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => startReschedule(selected)} activeOpacity={0.85}>
                    <Ionicons name="calendar-outline" size={18} color={C.INK} />
                    <Text style={styles.actionTxt}>Reschedule</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => cancelSchedule(selected)} activeOpacity={0.9}>
                    <LinearGradient colors={FLOW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionPrimary}>
                      <Ionicons name="flash" size={17} color={C.WHITE} />
                      <Text style={[styles.actionTxt, styles.actionTxtPrimary]}>Publish now</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* iOS reschedule picker */}
      {Platform.OS === 'ios' && (
        <Modal visible={!!iosPickAt} animationType="slide" transparent onRequestClose={() => setIosPickAt(null)}>
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Reschedule</Text>
                <TouchableOpacity onPress={() => { const at = iosPickAt; setIosPickAt(null); if (selected && at) { applyReschedule(selected.id, at); } }} hitSlop={10}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.MD },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.MD },
  iconBtn:   { width: 40, height: 40, borderRadius: RADIUS.FULL, alignItems: 'center', justifyContent: 'center', backgroundColor: C.SURFACE_2 },
  title:     { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK, textAlign: 'center' },
  subtitle:  { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM, color: C.ACCENT_HOT, textAlign: 'center', marginTop: 1 },

  card: { flex: 1, backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: RADIUS.LG, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: SPACE.SM },

  monthRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.SM, paddingVertical: SPACE.SM },
  navBtn:     { width: 34, height: 34, borderRadius: RADIUS.FULL, alignItems: 'center', justifyContent: 'center', backgroundColor: C.SURFACE_2 },
  monthLabel: { fontSize: FONT.SIZES.MD, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK, letterSpacing: 0.3 },

  weekdays: { flexDirection: 'row', marginBottom: SPACE.XS, marginTop: SPACE.XS },
  weekday:  { flex: 1, textAlign: 'center', color: C.SUBTLE, fontFamily: FONT.BODY_BOLD, fontSize: 11, letterSpacing: 0.5 },

  week: { flexDirection: 'row' },
  cell: { flex: 1, minHeight: 74, padding: 3, margin: 1.5, borderRadius: RADIUS.SM, gap: 2 },
  cellActive:  { backgroundColor: 'rgba(255,255,255,0.04)' },
  dayNum:      { fontSize: 12, color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, alignSelf: 'flex-end', paddingRight: 2 },
  todayPill:   { alignSelf: 'flex-end', width: 22, height: 22, borderRadius: 11, backgroundColor: C.ACCENT_HOT, alignItems: 'center', justifyContent: 'center' },
  todayNum:    { fontSize: 12, color: C.WHITE, fontFamily: FONT.BODY_BOLD },
  bar:     { borderRadius: RADIUS.FULL, paddingHorizontal: 5, paddingVertical: 2 },
  barText: { color: C.WHITE, fontSize: 9, fontFamily: FONT.BODY_BOLD },
  more:    { fontSize: 9, color: C.SUBTLE, fontFamily: FONT.BODY_MEDIUM, paddingLeft: 3 },

  emptyWrap: { alignItems: 'center', marginTop: SPACE.XXXL, gap: SPACE.XS },
  empty:     { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },
  emptyHint: { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.SM },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: SPACE.LG },
  sheet:        { backgroundColor: C.SURFACE_2, borderRadius: RADIUS.LG, padding: SPACE.LG, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  sheetHead:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle:   { flex: 1, fontSize: FONT.SIZES.MD, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK, marginRight: SPACE.SM },
  sheetWhen:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACE.SM, marginBottom: SPACE.MD },
  sheetWhenTxt: { color: C.MUTED, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.SM },
  preview:      { height: 300, aspectRatio: 9 / 16, alignSelf: 'center', borderRadius: RADIUS.MD, backgroundColor: '#000', overflow: 'hidden' },
  previewEmpty: { alignItems: 'center', justifyContent: 'center' },
  playBtn:      { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: SPACE.SM },
  playBg:       { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: RADIUS.FULL, padding: 14 },
  processing:   { color: C.WHITE, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  sheetActions: { flexDirection: 'row', gap: SPACE.SM, marginTop: SPACE.LG, alignItems: 'center' },
  actionBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE },
  actionPrimary:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,  borderRadius: RADIUS.MD },
  actionTxt:      { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, paddingVertical: SPACE.LG },
  actionTxtPrimary: { color: C.WHITE, paddingVertical: SPACE.MD },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet:   { backgroundColor: C.SURFACE_2, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG, paddingBottom: SPACE.XL, borderTopWidth: 1, borderColor: C.BORDER },
  pickerHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACE.LG },
  pickerTitle:   { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },
  pickerDone:    { color: C.ACCENT_HOT, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.MD },
});
