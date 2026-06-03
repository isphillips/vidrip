import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { fetchFriends, type Friend } from '../../../infrastructure/supabase/queries/friends';
import { sendThread, fetchAlreadySentRecipients } from '../../../infrastructure/supabase/queries/threads';
import type { ShareStackScreenProps } from '../../../app/navigation/types';

export default function SelectRecipientsScreen({
  route,
  navigation,
}: ShareStackScreenProps<'SelectRecipients'>) {
  const { videoId, videoTitle, videoThumbnail } = route.params;
  const { user } = useAuthStore();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [alreadySent, setAlreadySent] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [friendList, sentIds] = await Promise.all([
        fetchFriends(user.id),
        fetchAlreadySentRecipients(user.id, videoId),
      ]);
      setFriends(friendList);
      setAlreadySent(new Set(sentIds));
    } catch (e) {
      console.error('[SelectRecipients] load error:', JSON.stringify(e));
    } finally {
      setLoading(false);
    }
  }, [user, videoId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (item: Friend) => {
    if (alreadySent.has(item.userId)) { return; }
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(item.userId) ? next.delete(item.userId) : next.add(item.userId);
      return next;
    });
  };

  const handleSend = async () => {
    if (!user || selected.size === 0) return;
    setSending(true);
    try {
      const { alreadySentTo } = await sendThread(
        user.id, videoId, videoTitle, videoThumbnail, Array.from(selected),
      );
      // Update local already-sent set so subsequent selections reflect reality
      setAlreadySent(prev => new Set([...prev, ...alreadySentTo, ...selected]));
      setSelected(new Set());
      Alert.alert('Sent!', 'Your friends will be notified.', [
        { text: 'OK', onPress: () => navigation.getParent()?.navigate('Feed') },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not send. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.preview}>
        <Text style={styles.previewTitle} numberOfLines={2}>{videoTitle}</Text>
        <Text style={styles.previewId}>youtube.com/shorts/{videoId}</Text>
      </View>

      <Text style={styles.sectionTitle}>Send To</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.ACCENT} />
        </View>
      ) : friends.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No friends yet</Text>
          <Text style={styles.emptyHint}>Add friends from the Friends tab first</Text>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.userId}
          style={styles.list}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.userId);
            const isSent = alreadySent.has(item.userId);
            return (
              <TouchableOpacity
                style={[styles.row, isSelected && styles.rowSelected, isSent && styles.rowSent]}
                onPress={() => toggle(item)}
                disabled={isSent}
                activeOpacity={isSent ? 1 : 0.7}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.displayName[0]?.toUpperCase()}</Text>
                </View>
                <View style={styles.rowInfo}>
                  <Text style={[styles.name, isSent && styles.nameSent]}>{item.displayName}</Text>
                  <Text style={styles.handle}>
                    @{item.handle}{isSent ? '  ✓ Sent' : ''}
                  </Text>
                </View>
                {!isSent && (
                  <View style={[styles.check, isSelected && styles.checkSelected]}>
                    {isSelected && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity
        style={[styles.button, (selected.size === 0 || sending || loading) && styles.buttonDisabled]}
        onPress={handleSend}
        disabled={selected.size === 0 || sending || loading}>
        {sending ? (
          <ActivityIndicator color={C.WHITE} />
        ) : (
          <Text style={styles.buttonText}>
            Send To {selected.size > 0 ? `${selected.size} ` : ''}friend{selected.size !== 1 ? 's' : ''}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  preview: {
    backgroundColor: C.SURFACE,
    margin: SPACE.LG,
    padding: SPACE.MD,
    borderRadius: RADIUS.MD,
  },
  previewTitle: { fontSize: FONT.SIZES.MD, fontWeight: '600', color: C.INK },
  previewId: { fontSize: FONT.SIZES.SM, color: C.SUBTLE, marginTop: 2 },
  sectionTitle: {
    fontSize: FONT.SIZES.SM,
    color: C.MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginHorizontal: SPACE.LG,
    marginBottom: SPACE.SM,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.SM },
  emptyText: { fontSize: FONT.SIZES.LG, fontWeight: '600', color: C.INK },
  emptyHint: { fontSize: FONT.SIZES.SM, color: C.MUTED },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACE.LG,
    gap: SPACE.MD,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  rowSelected: { backgroundColor: C.SURFACE },
  rowSent: { opacity: 0.5 },
  nameSent: { color: C.MUTED },
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
  check: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.FULL,
    borderWidth: 2,
    borderColor: C.BORDER_STRONG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
  checkMark: { color: C.WHITE, fontSize: 12, fontWeight: '700' },
  button: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    margin: SPACE.LG,
    padding: SPACE.LG,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD,
    fontWeight: '700' },
});
