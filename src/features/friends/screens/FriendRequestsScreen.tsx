import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import ScreenGradient from '../../../components/ScreenGradient';
import { useAuthStore } from '../../../store/authStore';
import { openProfile } from '../../../store/profileDrawerStore';
import {
  fetchPendingRequests, acceptFriendRequest, declineFriendRequest, type PendingRequest,
} from '../../../infrastructure/supabase/queries/friends';
import type { RootStackScreenProps } from '../../../app/navigation/types';

// Incoming friend requests — a dismissable modal (close button) since it's opened from any tab header.
// Accept, decline, or tap through to the requester's profile (global drawer overlay).
export default function FriendRequestsScreen({ navigation }: RootStackScreenProps<'FriendRequests'>) {
  const { user } = useAuthStore();
  const { top } = useSafeAreaInsets();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const load = useCallback(async (silent = false) => {
    if (!user) { return; }
    if (!silent) { setLoading(true); }
    try {
      setRequests(await fetchPendingRequests(user.id));
    } catch { /* keep what we have */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handle = useCallback(async (req: PendingRequest, action: 'accept' | 'decline') => {
    if (processing.has(req.friendshipId)) { return; }
    setProcessing(prev => new Set(prev).add(req.friendshipId));
    setRequests(prev => prev.filter(r => r.friendshipId !== req.friendshipId)); // optimistic
    try {
      if (action === 'accept') { await acceptFriendRequest(req.friendshipId); }
      else { await declineFriendRequest(req.friendshipId); }
    } catch {
      load(true); // reconcile if it failed
    } finally {
      setProcessing(prev => { const n = new Set(prev); n.delete(req.friendshipId); return n; });
    }
  }, [processing, load]);

  return (
    <ScreenGradient>
      <View style={[styles.header, { paddingTop: top + SPACE.SM }]}>
        <Text style={styles.title}>Friend Requests</Text>
        <TouchableOpacity style={styles.close} hitSlop={10} activeOpacity={0.7} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color={C.INK} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.ACCENT_HOT} /></View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={r => r.friendshipId}
          contentContainerStyle={requests.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.ACCENT_HOT} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={40} color={C.SUBTLE} />
              <Text style={styles.emptyTitle}>No friend requests</Text>
              <Text style={styles.emptySub}>When someone adds you, you'll see it here.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const initial = (item.displayName || item.handle || '?').charAt(0).toUpperCase();
            const busy = processing.has(item.friendshipId);
            return (
              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.who}
                  activeOpacity={0.7}
                  onPress={() => openProfile({ userId: item.userId, handle: item.handle })}>
                  {item.avatarUrl
                    ? <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                    : <View style={styles.avatarFallback}><Text style={styles.avatarLetter}>{initial}</Text></View>}
                  <View style={styles.meta}>
                    <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
                    <Text style={styles.handle} numberOfLines={1}>@{item.handle}</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.btn, styles.accept, busy && styles.btnDisabled]}
                    activeOpacity={0.85} disabled={busy}
                    onPress={() => handle(item, 'accept')}>
                    <Ionicons name="checkmark" size={20} color={C.WHITE} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.decline, busy && styles.btnDisabled]}
                    activeOpacity={0.85} disabled={busy}
                    onPress={() => handle(item, 'decline')}>
                    <Ionicons name="close" size={20} color={C.INK} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.LG, paddingBottom: SPACE.SM },
  title: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  close: { marginLeft: 'auto', width: 36, height: 36, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.BORDER },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: SPACE.LG, gap: SPACE.SM },
  emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL },
  empty: { alignItems: 'center', gap: SPACE.SM },
  emptyTitle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK, marginTop: SPACE.SM },
  emptySub: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED, textAlign: 'center' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, padding: SPACE.MD,
  },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.MD },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.SURFACE_2 },
  avatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.SURFACE_2, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: C.INK, fontFamily: FONT.DISPLAY_BOLD, fontSize: FONT.SIZES.LG },
  meta: { flex: 1 },
  name: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  handle: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED },

  actions: { flexDirection: 'row', gap: SPACE.SM },
  btn: { width: 40, height: 40, borderRadius: RADIUS.FULL, alignItems: 'center', justifyContent: 'center' },
  accept: { backgroundColor: C.ACCENT_HOT },
  decline: { backgroundColor: C.SURFACE_2, borderWidth: 1, borderColor: C.BORDER },
  btnDisabled: { opacity: 0.5 },
});
