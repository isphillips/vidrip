import React, { useState } from 'react';
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
import type { ShareStackScreenProps } from '../../../app/navigation/types';

// Placeholder friends — will be replaced with real data from Supabase
const MOCK_FRIENDS = [
  { id: 'u1', handle: 'alex', displayName: 'Alex K.' },
  { id: 'u2', handle: 'maya', displayName: 'Maya T.' },
  { id: 'u3', handle: 'jordan', displayName: 'Jordan L.' },
];

export default function SelectRecipientsScreen({
  route,
  navigation,
}: ShareStackScreenProps<'SelectRecipients'>) {
  const { videoId, videoTitle, videoThumbnail } = route.params;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleSend = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      // TODO: create thread + thread_members in Supabase, trigger push notifications
      Alert.alert('Sent!', 'Your friends will be notified.', [
        { text: 'OK', onPress: () => navigation.getParent()?.navigate('FeedHome') },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.preview}>
        <Text style={styles.previewTitle} numberOfLines={2}>{videoTitle}</Text>
        <Text style={styles.previewId}>ID: {videoId}</Text>
      </View>

      <Text style={styles.sectionTitle}>send to</Text>
      <FlatList
        data={MOCK_FRIENDS}
        keyExtractor={(item) => item.id}
        style={styles.list}
        renderItem={({ item }) => {
          const isSelected = selected.has(item.id);
          return (
            <TouchableOpacity
              style={[styles.row, isSelected && styles.rowSelected]}
              onPress={() => toggle(item.id)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.displayName[0]}</Text>
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.handle}>@{item.handle}</Text>
              </View>
              <View style={[styles.check, isSelected && styles.checkSelected]}>
                {isSelected && <Text style={styles.checkMark}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        style={[styles.button, (selected.size === 0 || sending) && styles.buttonDisabled]}
        onPress={handleSend}
        disabled={selected.size === 0 || sending}>
        {sending ? (
          <ActivityIndicator color={C.WHITE} />
        ) : (
          <Text style={styles.buttonText}>
            send to {selected.size > 0 ? `${selected.size} ` : ''}friend{selected.size !== 1 ? 's' : ''}
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
  name: { fontSize: FONT.SIZES.MD, fontWeight: '600', color: C.INK },
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
  buttonText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontWeight: '700' },
});
