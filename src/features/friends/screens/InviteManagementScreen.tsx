import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { fetchMyInviteCodes } from '../../../infrastructure/supabase/queries/friends';

type InviteCode = { code: string; used_by: string | null; used_at: string | null };

export default function InviteManagementScreen() {
  const { user } = useAuthStore();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchMyInviteCodes(user.id);
      setCodes(data as InviteCode[]);
    } catch {
      // degrade silently
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleShare = async (code: string) => {
    await Share.share({
      message: `Join me on Reaxn! Use invite code: ${code}\n\nDownload the app and enter this code to sign up.`,
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.ACCENT} />
      </View>
    );
  }

  const available = codes.filter((c) => !c.used_by);
  const used = codes.filter((c) => c.used_by);

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={available}
      keyExtractor={(item) => item.code}
      ListHeaderComponent={
        <>
          <Text style={styles.title}>Invite Codes</Text>
          <Text style={styles.subtitle}>
            {available.length} available · {used.length} used
          </Text>
          {available.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No Codes Available</Text>
              <Text style={styles.emptyHint}>New codes are generated as your friends join</Text>
            </View>
          )}
        </>
      }
      renderItem={({ item }) => (
        <View style={styles.codeRow}>
          <Text style={styles.code}>{item.code}</Text>
          <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare(item.code)}>
            <Text style={styles.shareBtnText}>share</Text>
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  content: { padding: SPACE.LG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.BG },
  title: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD,
    fontWeight: '700', color: C.INK, marginBottom: SPACE.XS },
  subtitle: { fontSize: FONT.SIZES.MD, color: C.MUTED, marginBottom: SPACE.XL },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    marginBottom: SPACE.SM,
  },
  code: {
    fontSize: FONT.SIZES.LG,
    fontWeight: '700',
    color: C.INK,
    letterSpacing: 2,
  },
  shareBtn: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.SM,
    paddingHorizontal: SPACE.MD,
    paddingVertical: SPACE.XS,
  },
  shareBtnText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: SPACE.XXXL, gap: SPACE.SM },
  emptyText: { fontSize: FONT.SIZES.LG, fontWeight: '600', color: C.INK },
  emptyHint: { fontSize: FONT.SIZES.SM, color: C.MUTED, textAlign: 'center' },
});
