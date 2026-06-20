import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, SectionList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal,
  Linking, Platform, RefreshControl,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { ensureContactsPermission, loadDeviceContacts, type DeviceContact } from '../../../infrastructure/native/contacts';
import { fetchMyInviteCodes } from '../../../infrastructure/supabase/queries/friends';
import { matchContacts, type ContactMatch } from '../../../infrastructure/supabase/queries/contactMatch';
import {
  loadSentInvites, recordSentInvite, sentCodes, type SentInviteMap,
} from '../../../infrastructure/storage/sentInvitesStorage';

// ── A–Z index (mirrors FriendsHome) ───────────────────────────────────────────
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
const AZ_ROW = 12;
const AZ_H = LETTERS.length * AZ_ROW;
const azOrder = (t: string) => (t === '#' ? 91 : t.charCodeAt(0));

type Section = { title: string; data: DeviceContact[] };
function groupByName(items: DeviceContact[]): Section[] {
  const map = new Map<string, DeviceContact[]>();
  for (const c of items) {
    const ch = (c.name.trim()[0] || '#').toUpperCase();
    const key = /[A-Z]/.test(ch) ? ch : '#';
    (map.get(key) ?? map.set(key, []).get(key)!).push(c);
  }
  return [...map.keys()].sort((a, b) => azOrder(a) - azOrder(b)).map(title => ({ title, data: map.get(title)! }));
}

// Fixed row/header heights so we can hand-roll getItemLayout — that's what lets the A–Z
// rail jump to a section far down a long contacts list. Without it scrollToLocation
// fails silently on sections that haven't been measured/rendered yet (the bug that made
// the lettering feel dead). SectionList flattens each section into [header, ...rows,
// footer] index slots — the trailing footer slot exists even with no renderSectionFooter
// — so the walk below mirrors that exact structure.
const ROW_H = 56;     // avatar 40 + 2×SPACE.SM vertical padding
const HEADER_H = 34;  // azHeader fixed height
function sectionGetItemLayout(
  data: ReadonlyArray<{ data: ReadonlyArray<unknown> }> | null,
  index: number,
): { length: number; offset: number; index: number } {
  if (!data) { return { length: ROW_H, offset: 0, index }; }
  let offset = 0;
  let cursor = 0;
  for (const section of data) {
    if (cursor === index) { return { length: HEADER_H, offset, index }; }   // section header
    offset += HEADER_H; cursor += 1;
    for (let r = 0; r < section.data.length; r++) {
      if (cursor === index) { return { length: ROW_H, offset, index }; }     // contact row
      offset += ROW_H; cursor += 1;
    }
    if (cursor === index) { return { length: 0, offset, index }; }           // section footer slot
    cursor += 1;
  }
  return { length: 0, offset, index };
}

function AZIndex({ available, onSelect, bottomGap = 0 }: { available: Set<string>; onSelect: (l: string) => void; bottomGap?: number }) {
  // Only fire on crossing into a NEW letter — calling scrollToLocation on every move
  // event floods the SectionList and makes the rail letters flash/double + open gaps.
  const last = useRef<string | null>(null);
  const pick = (y: number) => {
    const l = LETTERS[Math.max(0, Math.min(LETTERS.length - 1, Math.floor(y / AZ_ROW)))];
    if (l !== last.current) { last.current = l; onSelect(l); }
  };
  return (
    <View
      // Centre within the VISIBLE area: shift the centred rail up by half the nav gap
      // so it isn't sitting low / partly behind the bottom tab bar.
      style={[styles.azIndex, { marginTop: -(AZ_H + bottomGap) / 2 }]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => { last.current = null; pick(e.nativeEvent.locationY); }}
      onResponderMove={(e) => pick(e.nativeEvent.locationY)}
      onResponderRelease={() => { last.current = null; }}>
      {LETTERS.map(l => <Text key={l} style={[styles.azLetter, !available.has(l) && styles.azLetterDim]}>{l}</Text>)}
    </View>
  );
}

// ── invite message + SMS deep link ────────────────────────────────────────────
function smsUrl(phone: string, code: string): string {
  const number = phone.replace(/[^\d+]/g, '');
  const body = `Join me on Vidrip 🎬! Use my invite code ${code} to get in: https://vidrip.app/i/${code}`;
  // iOS wants the body after "&", Android after "?".
  const sep = Platform.OS === 'ios' ? '&' : '?';
  return `sms:${number}${sep}body=${encodeURIComponent(body)}`;
}

export default function InviteContactsScreen() {
  const { user } = useAuthStore();
  const tabBarHeight = useBottomTabBarHeight();

  const [perm, setPerm] = useState<'loading' | 'granted' | 'denied'>('loading');
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [sent, setSent] = useState<SentInviteMap>({});
  const [matches, setMatches] = useState<Record<string, ContactMatch>>({});
  const [codes, setCodes] = useState<string[]>([]);        // available (unredeemed) codes, server-side
  const [picker, setPicker] = useState<DeviceContact | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const sectionRef = useRef<SectionList<DeviceContact>>(null);

  // Pull-to-refresh: re-read device contacts (so contacts added since open appear),
  // plus refresh sent-invites, codes, and the "on Vidrip" matches.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const ok = await ensureContactsPermission();
      if (!ok) { setPerm('denied'); return; }
      setPerm('granted');
      const list = await loadDeviceContacts();
      setContacts(list);
      setSent(await loadSentInvites());
      if (user) {
        fetchMyInviteCodes(user.id)
          .then(rows => setCodes(rows.filter(r => !r.used_by).map(r => r.code)))
          .catch(() => {});
      }
      matchContacts(list).then(setMatches).catch(() => {});
    } catch { /* keep what we have */ }
    finally { setRefreshing(false); }
  }, [user]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await ensureContactsPermission();
      if (!alive) { return; }
      if (!ok) { setPerm('denied'); return; }
      setPerm('granted');
      try {
        const list = await loadDeviceContacts();
        if (!alive) { return; }
        setContacts(list);
        setSent(await loadSentInvites());
        if (user) {
          fetchMyInviteCodes(user.id)
            .then(rows => alive && setCodes(rows.filter(r => !r.used_by).map(r => r.code)))
            .catch(() => {});
        }
        // Best-effort "already on Vidrip" hint (hashed-email match) — non-blocking.
        matchContacts(list).then(m => alive && setMatches(m)).catch(() => {});
      } catch {
        if (alive) { setPerm('denied'); }
      }
    })();
    return () => { alive = false; };
  }, [user]);

  const sections = useMemo(() => groupByName(contacts), [contacts]);
  const available = useMemo(() => new Set(sections.map(s => s.title)), [sections]);
  const used = useMemo(() => sentCodes(sent), [sent]);
  const unsent = useMemo(() => codes.filter(c => !used.has(c)), [codes, used]);

  const scrollToLetter = useCallback((letter: string) => {
    if (!sections.length) { return; }
    let idx = sections.findIndex(s => s.title === letter);
    if (idx < 0) { idx = sections.findIndex(s => azOrder(s.title) >= azOrder(letter)); }
    if (idx < 0) { idx = sections.length - 1; }
    try { sectionRef.current?.scrollToLocation({ sectionIndex: idx, itemIndex: 0, viewPosition: 0, animated: false }); } catch { /* not measured */ }
  }, [sections]);

  const openPicker = (c: DeviceContact) => {
    if (codes.length === 0) {
      Alert.alert('No invite codes', 'You don’t have any invite codes right now. New ones are granted as your friends join.');
      return;
    }
    setPicker(c);
  };

  const sendInvite = async (c: DeviceContact, code: string) => {
    setPicker(null);
    const wasLastUnsent = !used.has(code) && unsent.length <= 1;
    try {
      await Linking.openURL(smsUrl(c.phones[0], code));
    } catch {
      Alert.alert('Could not open Messages', 'Try sharing the code another way.');
      return;
    }
    setSent(await recordSentInvite(c.id, c.name, code));
    if (wasLastUnsent) {
      Alert.alert(
        'That was your last code',
        'You’re out of unused invite codes. You can still send one you’ve already shared, but it may not work if a pending invite gets redeemed first.',
      );
    }
  };

  const renderRight = (c: DeviceContact) => {
    const m = matches[c.id];
    if (m?.isFriend) { return <View style={[styles.tag, styles.tagFriend]}><Text style={styles.tagText}>Friend</Text></View>; }
    if (m?.isUser) { return <View style={[styles.tag, styles.tagUser]}><Text style={styles.tagText}>On Vidrip</Text></View>; }
    if (sent[c.id]) {
      return <View style={styles.tagSent}><Ionicons name="checkmark" size={13} color={C.TEAL} /><Text style={styles.tagSentText}>Invited</Text></View>;
    }
    return (
      <TouchableOpacity style={styles.shareBtn} onPress={() => openPicker(c)} hitSlop={8} activeOpacity={0.8}>
        <Ionicons name="paper-plane-outline" size={16} color={C.WHITE} />
      </TouchableOpacity>
    );
  };

  if (perm === 'loading') {
    return <View style={styles.center}><ActivityIndicator color={C.ACCENT} /></View>;
  }
  if (perm === 'denied') {
    return (
      <View style={[styles.center, { padding: SPACE.XL }]}>
        <Ionicons name="people-outline" size={44} color={C.MUTED} />
        <Text style={styles.deniedTitle}>Contacts access is off</Text>
        <Text style={styles.deniedHint}>Allow contacts access to text friends an invite code. Numbers are never uploaded.</Text>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => Linking.openSettings()}>
          <Text style={styles.settingsTxt}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Invite from Contacts</Text>
        <Text style={styles.bannerSub}>
          {codes.length === 0
            ? 'No invite codes available yet'
            : `${unsent.length} of ${codes.length} code${codes.length === 1 ? '' : 's'} left to send`}
        </Text>
      </View>

      <View style={styles.listWrap}>
        <SectionList
          ref={sectionRef}
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + SPACE.LG }]}
          // Sticky headers jitter on iOS when momentum settles / scrollToLocation lands
          // on a boundary; the A–Z rail handles navigation, so keep headers inline.
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.ACCENT} />}
          getItemLayout={sectionGetItemLayout}
          onScrollToIndexFailed={() => {}}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No contacts with a phone number</Text>
            </View>
          }
          renderSectionHeader={({ section }) => <Text style={styles.azHeader}>{section.title}</Text>}
          renderItem={({ item }) => {
            const onPlatform = matches[item.id]?.isUser || !!sent[item.id];
            return (
              <View style={styles.row}>
                <View style={[styles.avatar, !onPlatform && styles.dim]}>
                  <Text style={styles.avatarText}>{item.name[0]?.toUpperCase()}</Text>
                </View>
                <Text style={[styles.name, !onPlatform && styles.dimText]} numberOfLines={1}>{item.name}</Text>
                {renderRight(item)}
              </View>
            );
          }}
        />
        {sections.length > 0 && <AZIndex available={available} onSelect={scrollToLetter} bottomGap={tabBarHeight} />}
      </View>

      {/* Code picker */}
      <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setPicker(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Send a code to {picker?.name}</Text>
            <Text style={styles.sheetHint}>Opens Messages with your invite link prefilled.</Text>
            {codes.map(code => {
              const already = used.has(code);
              return (
                <TouchableOpacity key={code} style={styles.codeRow} activeOpacity={0.8}
                  onPress={() => picker && sendInvite(picker, code)}>
                  <Text style={[styles.codeText, already && styles.codeUsed]}>{code}</Text>
                  {already
                    ? <Text style={styles.codeSentLabel}>Already allocated, but send anyway</Text>
                    : <Ionicons name="paper-plane" size={16} color={C.ACCENT_HOT} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.SM },
  banner: { paddingHorizontal: SPACE.LG, paddingTop: SPACE.MD, paddingBottom: SPACE.SM },
  bannerTitle: { fontSize: FONT.SIZES.XL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  bannerSub: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED, marginTop: 2 },

  listWrap: { flex: 1 },
  list: { paddingLeft: SPACE.LG, paddingRight: SPACE.XL, paddingBottom: SPACE.LG },
  azHeader: {
    height: HEADER_H, fontSize: FONT.SIZES.SM, lineHeight: FONT.SIZES.SM + 5, fontFamily: FONT.BODY_BOLD,
    color: C.ACCENT_HOT, backgroundColor: C.BG_SOLID, paddingTop: SPACE.MD, paddingBottom: SPACE.XS,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.MD, height: ROW_H },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.ACCENT_LITE, borderWidth: 1, borderColor: C.ACCENT, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.ACCENT_HOT, fontFamily: FONT.DISPLAY_BOLD, fontSize: FONT.SIZES.MD },
  name: { flex: 1, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  dim: { opacity: 0.45 },
  dimText: { color: C.MUTED },

  shareBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.ACCENT, alignItems: 'center', justifyContent: 'center' },
  tag: { paddingHorizontal: SPACE.SM, paddingVertical: 4, borderRadius: RADIUS.FULL, borderWidth: 1 },
  tagFriend: { borderColor: C.TEAL, backgroundColor: 'rgba(45,212,191,0.12)' },
  tagUser: { borderColor: C.ACCENT_HOT, backgroundColor: 'rgba(224,86,253,0.12)' },
  tagText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  tagSent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tagSentText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_SEMIBOLD, color: C.TEAL },

  azIndex: { position: 'absolute', right: 1, top: '50%', marginTop: -AZ_H / 2, height: AZ_H, width: 18, alignItems: 'center', justifyContent: 'space-between' },
  azLetter: { height: AZ_ROW, lineHeight: AZ_ROW, width: 18, textAlign: 'center', fontSize: 9.5, fontWeight: '700', color: C.ACCENT_HOT },
  // Alpha baked into the color (NOT `opacity`) so the dim letters don't ghost/double
  // over the scrolling list — see the matching note in FriendsHomeScreen.
  azLetterDim: { color: 'rgba(234,201,238,0.45)' },

  empty: { alignItems: 'center', paddingTop: SPACE.XXXL },
  emptyText: { color: C.MUTED, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY },

  deniedTitle: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK, marginTop: SPACE.SM },
  deniedHint: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  settingsBtn: { marginTop: SPACE.LG, borderWidth: 1, borderColor: C.ACCENT, borderRadius: RADIUS.FULL, paddingHorizontal: SPACE.XL, paddingVertical: SPACE.SM },
  settingsTxt: { color: C.ACCENT_HOT, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.SURFACE_2, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG, padding: SPACE.LG, gap: SPACE.SM, paddingBottom: SPACE.XXL },
  sheetTitle: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK },
  sheetHint: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED, marginBottom: SPACE.SM },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD },
  codeText: { fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, color: C.INK, letterSpacing: 1 },
  codeUsed: { color: C.MUTED },
  codeSentLabel: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, color: C.SUBTLE },
});
