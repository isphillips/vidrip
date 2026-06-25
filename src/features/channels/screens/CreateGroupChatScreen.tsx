import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import ScreenGradient from '../../../components/ScreenGradient';
import { useAuthStore } from '../../../store/authStore';
import { fetchFriends, type Friend } from '../../../infrastructure/supabase/queries/friends';
import { createGroupChat } from '../../../infrastructure/supabase/queries/channels';
import type { FeedStackScreenProps } from '../../../app/navigation/types';
import { DEMO_MODE } from '../../../demo/demoMode';

// Pick 2+ friends → a new group chat. Group chats are deliberately separate from
// sending a Short to multiple friends (which stays a set of 1:1 conversations).
export default function CreateGroupChatScreen({
  navigation,
}: FeedStackScreenProps<'CreateGroupChat'>) {
  const { user } = useAuthStore();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!user) { return; }
    try { 
      if (DEMO_MODE) { setFriends([]) }
      else { setFriends(await fetchFriends(user.id)); }
    }
    finally { setLoading(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) { n.delete(id); } else { n.add(id); }
    return n;
  });

  const canCreate = selected.size >= 2 && !creating;

  const create = useCallback(async () => {
    if (selected.size < 2 || !user) { return; }
    setCreating(true);
    try {
      const channelId = await createGroupChat([...selected]);
      // This screen is a root modal — dismiss it and open the new group in the Messages tab (so
      // backing out of the group lands on Messages, not this picker).
      (navigation as any).navigate('Main', {
        screen: 'Messages',
        params: {
          screen: 'Channel',
          params: {
            channelId, channelName: 'Group chat',
            isPublic: false, isJoined: true, isOwner: true, isMembersOnly: false, isGroupChat: true,
          },
        },
      });
    } catch (e: any) {
      Alert.alert('Could not create group', e?.message ?? 'Please try again.');
      setCreating(false);
    }
  }, [selected, user, navigation]);

  return (
    <ScreenGradient>
      <View style={[styles.header, { paddingTop: SPACE.XXL }]}>
        <Text style={styles.headerTitle}>New Group Chat</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.plusBtn} onPress={create} disabled={!canCreate} hitSlop={10} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Create group">
            {creating
              ? <ActivityIndicator color={C.WHITE} size="small" />
              : <Ionicons name="add" size={30} color={canCreate ? C.WHITE : C.SUBTLE} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerClose} onPress={() => navigation.goBack()} hitSlop={10} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={C.INK} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.hint}>
        {selected.size < 2
          ? 'Select at least 2 friends.'
          : `${selected.size} selected`}
      </Text>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.ACCENT} /></View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={f => f.userId}
          style={styles.list}
          contentContainerStyle={friends.length === 0 ? styles.center : styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>Add some friends first.</Text>}
          renderItem={({ item }) => {
            const on = selected.has(item.userId);
            const initial = (item.displayName || item.handle || '?').charAt(0).toUpperCase();
            return (
              <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => toggle(item.userId)}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}><Text style={styles.avatarLetter}>{initial}</Text></View>
                )}
                <View style={styles.meta}>
                  <Text style={styles.name} numberOfLines={1}>{item.displayName || `@${item.handle}`}</Text>
                  <Text style={styles.handle} numberOfLines={1}>@{item.handle}</Text>
                </View>
                <View style={[styles.check, on && styles.checkOn]}>
                  {on && <Ionicons name="checkmark" size={16} color={C.WHITE} />}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingBottom: SPACE.XXL },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    paddingHorizontal: SPACE.MD, paddingBottom: SPACE.SM,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  headerTitle: { flex: 1, fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK },
  // Right-side actions mirror the Friends modal: a "+" (create) and an "×" close button.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM },
  plusBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerClose: {
    width: 36, height: 36, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.BORDER,
  },
  hint: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED, padding: SPACE.LG, paddingBottom: SPACE.SM },
  empty: { fontSize: FONT.SIZES.MD, color: C.MUTED, textAlign: 'center' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.SURFACE_2 },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: C.ACCENT_LITE,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.ACCENT,
  },
  avatarLetter: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.ACCENT },
  meta: { flex: 1 },
  name: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.INK },
  handle: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED },
  check: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: C.BORDER_STRONG,
    alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
});
