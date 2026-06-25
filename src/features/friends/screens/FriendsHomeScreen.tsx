import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, Easing as ReEasing } from 'react-native-reanimated';
import GradientButton from '../../studio/components/GradientButton';
import ScreenGradient from '../../../components/ScreenGradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Handle from '../../../components/Handle';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { useBlockStore } from '../../../store/blockStore';
import {
  fetchFriends,
  fetchPendingRequests,
  acceptFriendRequest,
  declineFriendRequest,
  type Friend,
  type PendingRequest,
} from '../../../infrastructure/supabase/queries/friends';
import type { FriendsStackScreenProps } from '../../../app/navigation/types';

// A plain white "+" that spins one full turn and lands as an "×" when active (it's the same plus
// rotated 45°), reversing back to "+" when not. Used as the add-friend toggle.
function MorphPlus({ active, onPress }: { active: boolean; onPress: () => void }) {
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withTiming(active ? 405 : 0, { duration: 420, easing: ReEasing.out(ReEasing.cubic) });
  }, [active, rot]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return (
    <TouchableOpacity onPress={onPress} hitSlop={10} activeOpacity={0.7} style={styles.plusBtn} accessibilityLabel="Add friend">
      <Reanimated.View style={st}><Ionicons name="add" size={30} color={C.WHITE} /></Reanimated.View>
    </TouchableOpacity>
  );
}

// ── Alphabetical sections + iOS-style A–Z index ───────────────────────────────
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
const AZ_ROW = 12;                 // height per letter in the side index
const AZ_H = LETTERS.length * AZ_ROW;
const order = (t: string) => (t === '#' ? 91 : t.charCodeAt(0)); // A=65…Z=90, # last

type FriendSection = { title: string; data: Friend[] };
function groupFriends(friends: Friend[]): FriendSection[] {
  const map = new Map<string, Friend[]>();
  const sorted = [...friends].sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
  for (const f of sorted) {
    const ch = (f.displayName.trim()[0] || '#').toUpperCase();
    const key = /[A-Z]/.test(ch) ? ch : '#';
    (map.get(key) ?? map.set(key, []).get(key)!).push(f);
  }
  return [...map.keys()].sort((a, b) => order(a) - order(b)).map(title => ({ title, data: map.get(title)! }));
}

// The vertical A–Z+# rail on the right; tap or drag to jump to a section (greyed where empty).
function AZIndex({ available, onSelect, onGrabChange }: { available: Set<string>; onSelect: (l: string) => void; onGrabChange?: (grabbing: boolean) => void }) {
  // Only fire when the finger crosses into a NEW letter. onResponderMove fires dozens of
  // times per second; calling scrollToLocation on each one floods the SectionList (it
  // re-sticks headers + re-windows rows mid-drag → the letters flash/double and gaps appear).
  const last = useRef<string | null>(null);
  const pick = (y: number) => {
    const l = LETTERS[Math.max(0, Math.min(LETTERS.length - 1, Math.floor(y / AZ_ROW)))];
    if (l !== last.current) { last.current = l; onSelect(l); }
  };
  return (
    <View
      style={styles.azIndex}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => { last.current = null; onGrabChange?.(true); pick(e.nativeEvent.locationY); }}
      onResponderMove={(e) => pick(e.nativeEvent.locationY)}
      onResponderRelease={() => { last.current = null; onGrabChange?.(false); }}
      onResponderTerminate={() => { last.current = null; onGrabChange?.(false); }}>
      {LETTERS.map(l => (
        <Text key={l} style={[styles.azLetter, !available.has(l) && styles.azLetterDim]}>{l}</Text>
      ))}
    </View>
  );
}

export default function FriendsHomeScreen({ navigation }: FriendsStackScreenProps<'FriendsHome'>) {
  const { top } = useSafeAreaInsets();
  // Shown as the "Friend list" root modal (vs the Friends tab home) → offer a close-X that dismisses
  // the whole modal. canGoBack on the PARENT (Root) is true only in the modal case, false as a tab root.
  const inModal = !!navigation.getParent?.()?.canGoBack?.();
  const { user } = useAuthStore();
  const blocked = useBlockStore(s => s.blocked);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [addActive, setAddActive] = useState(false);
  // Spin the + to an × on tap, then push the AddFriend screen a beat later so the morph is seen.
  const openAddFriend = () => {
    setAddActive(true);
    setTimeout(() => (navigation as any).navigate('FindFriend'), 200);
  };
  // App-wide block: hide blocked users from the friends + requests lists.
  const visFriends = friends.filter(f => !blocked.has(f.userId));
  const visPending = pending.filter(p => !blocked.has(p.userId));

  // Group friends A–Z (with a trailing # bucket) and wire the side index to scroll to sections.
  const sections = useMemo(() => groupFriends(visFriends), [visFriends]);
  const available = useMemo(() => new Set(sections.map(s => s.title)), [sections]);
  const sectionRef = useRef<SectionList<Friend>>(null);
  const scrollToLetter = useCallback((letter: string) => {
    if (!sections.length) { return; }
    let idx = sections.findIndex(s => s.title === letter);
    if (idx < 0) { idx = sections.findIndex(s => order(s.title) >= order(letter)); }
    if (idx < 0) { idx = sections.length - 1; }
    try { sectionRef.current?.scrollToLocation({ sectionIndex: idx, itemIndex: 0, viewPosition: 0, animated: false }); } catch { /* not measured yet */ }
  }, [sections]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [f, p] = await Promise.all([fetchFriends(user.id), fetchPendingRequests(user.id)]);
      setFriends(f);
      setPending(p);
    } catch {
      // degrade silently
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { setAddActive(false); load(); }, [load]));

  const handleAccept = async (req: PendingRequest) => {
    try {
      await acceptFriendRequest(req.friendshipId);
      setPending((p) => p.filter((r) => r.friendshipId !== req.friendshipId));
      setFriends((f) => [...f, { friendshipId: req.friendshipId, userId: req.userId, handle: req.handle, displayName: req.displayName, avatarUrl: req.avatarUrl }]);
    } catch {
      Alert.alert('Error', 'Could not accept request. Try again.');
    }
  };

  const handleDecline = async (req: PendingRequest) => {
    try {
      await declineFriendRequest(req.friendshipId);
      setPending((p) => p.filter((r) => r.friendshipId !== req.friendshipId));
    } catch {
      Alert.alert('Error', 'Could not decline request. Try again.');
    }
  };

  if (loading) {
    return (
      <ScreenGradient>
        <View style={styles.center}>
          <ActivityIndicator color={C.ACCENT} />
        </View>
      </ScreenGradient>
    );
  }

  return (
    <ScreenGradient>
    <View style={styles.container}>
      <View style={[styles.headerRow, { paddingTop: SPACE.XXL }]}>
        <Text style={styles.title}>Friends</Text>
        <View style={styles.headerActions}>
          <MorphPlus active={addActive} onPress={openAddFriend} />
          {inModal && (
            <TouchableOpacity style={styles.headerClose} hitSlop={10} activeOpacity={0.7} onPress={() => navigation.getParent()?.goBack()} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={C.INK} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.listWrap}>
        <SectionList
          ref={sectionRef}
          sections={sections}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.list}
          // Sticky headers jitter on iOS when momentum settles / scrollToLocation lands
          // on a boundary; the A–Z rail handles navigation, so keep headers inline.
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          onScrollToIndexFailed={() => {}}
          ListHeaderComponent={
            visPending.length > 0 ? (
              <View>
                <Text style={styles.sectionLabel}>Requests</Text>
                {visPending.map((req) => (
                  <View key={req.friendshipId} style={styles.requestRow}>
                    <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: req.userId })} activeOpacity={0.8}>
                      {req.avatarUrl ? (
                        <Image source={{ uri: req.avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{req.displayName[0]?.toUpperCase()}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <View style={styles.rowInfo}>
                      <Text style={styles.name}>{req.displayName}</Text>
                      <Handle userId={req.userId} handle={req.handle} style={styles.handle} />
                    </View>
                    <View style={styles.requestActions}>
                      <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(req)}>
                        <Text style={styles.acceptBtnText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(req)}>
                        <Text style={styles.declineBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {visFriends.length > 0 && <Text style={styles.sectionLabel}>Friends</Text>}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No friends yet</Text>
              <Text style={styles.emptyHint}>Tap + to find people by handle</Text>
            </View>
          }
          renderSectionHeader={({ section }) => <Text style={styles.azHeader}>{section.title}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: item.userId })} activeOpacity={0.8}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.displayName[0]?.toUpperCase()}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View>
                <Text style={styles.name}>{item.displayName}</Text>
                <Handle userId={item.userId} handle={item.handle} style={styles.handle} />
              </View>
            </View>
          )}
        />
        {sections.length > 0 && (
          <AZIndex
            available={available}
            onSelect={scrollToLetter}
            // While dragging the rail, turn off the modal's swipe-to-dismiss so a downward drag
            // jumps A→Z instead of closing the modal; restore it on release.
            onGrabChange={inModal ? (g) => navigation.getParent()?.setOptions({ gestureEnabled: !g }) : undefined}
          />
        )}
      </View>

      <GradientButton
        label="Invite from Contacts"
        icon="people-outline"
        variant="outline"
        onPress={() => (navigation as any).navigate('ImportContacts')}
        style={styles.inviteCtaTop}
      />
    </View>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  headerClose: { width: 36, height: 36, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.BORDER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.BG },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 0,
  },
  title: {
    fontSize: FONT.SIZES.XL,
    fontFamily: FONT.DISPLAY_BOLD,
    color: C.INK,
    padding: SPACE.LG,
    marginTop: 0,
    fontWeight: FONT.WEIGHTS.BOLD,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.XS, paddingRight: SPACE.LG },
  plusBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: {
    fontSize: FONT.SIZES.SM,
    color: C.MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginHorizontal: SPACE.LG,
    marginBottom: SPACE.SM,
    marginTop: SPACE.XS,
  },
  listWrap: { flex: 1 },
  list: { paddingLeft: SPACE.LG, paddingRight: SPACE.XL, gap: SPACE.SM, paddingBottom: SPACE.LG },
  azHeader: {
    fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_BOLD, color: C.ACCENT_HOT,
    backgroundColor: C.BG_SOLID, paddingHorizontal: SPACE.LG, paddingTop: SPACE.MD, paddingBottom: SPACE.XS,
  },
  // iOS-Contacts-style index rail, vertically centred on the right edge.
  azIndex: {
    position: 'absolute', right: 1, top: '50%', marginTop: -AZ_H / 2, height: AZ_H,
    width: 18, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 1,
  },
  azLetter: { height: AZ_ROW, lineHeight: AZ_ROW, width: 18, textAlign: 'center', fontSize: 9.5, fontWeight: '700', color: C.ACCENT_HOT },
  // Alpha baked into the color (NOT `opacity`): an `opacity` view-style forces each dim
  // letter into an offscreen layer that iOS re-composites over the scrolling list every
  // frame → the greyed letters ghost/double during scroll. A translucent color doesn't.
  azLetterDim: { color: 'rgba(234,201,238,0.45)' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.MD,
    backgroundColor: C.SURFACE,
    padding: SPACE.MD,
    borderRadius: RADIUS.MD,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.MD,
    backgroundColor: C.SURFACE,
    marginHorizontal: SPACE.LG,
    marginBottom: SPACE.SM,
    padding: SPACE.MD,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.ACCENT_LITE,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.FULL,
    backgroundColor: C.ACCENT_LITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: FONT.SIZES.LG, fontWeight: '700', color: C.ACCENT },
  rowInfo: { flex: 1 },
  name: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD,
    fontWeight: '600', color: C.INK },
  handle: { fontSize: FONT.SIZES.SM, color: C.MUTED },
  requestActions: { flexDirection: 'row', gap: SPACE.SM },
  acceptBtn: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.SM,
    paddingHorizontal: SPACE.MD,
    paddingVertical: SPACE.XS,
  },
  acceptBtnText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontWeight: '600' },
  declineBtn: {
    backgroundColor: C.SURFACE_2,
    borderRadius: RADIUS.SM,
    paddingHorizontal: SPACE.MD,
    paddingVertical: SPACE.XS,
  },
  declineBtnText: { color: C.MUTED, fontSize: FONT.SIZES.SM },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.SM },
  emptyText: { fontSize: FONT.SIZES.LG, fontWeight: '600', color: C.INK },
  emptyHint: { fontSize: FONT.SIZES.SM, color: C.MUTED },
  inviteCtaTop: { marginHorizontal: SPACE.LG, marginBottom: SPACE.SM },
  inviteCta: { marginHorizontal: SPACE.LG, marginBottom: SPACE.XXL },
  reactBtn: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    alignItems: 'center',
  },
});
