import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { supabase } from '../../../infrastructure/supabase/client';
import { useAuthStore } from '../../../store/authStore';
import type { AccountStackScreenProps } from '../../../app/navigation/types';

export default function AccountScreen({ navigation }: AccountStackScreenProps<'AccountHome'>) {
  const { top } = useSafeAreaInsets();
  const { profile, signOut } = useAuthStore();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await supabase.auth.signOut();
          signOut();
        },
      },
    ]);
  };

  const initial = profile?.display_name?.[0]?.toUpperCase() ?? '?';
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: top + SPACE.LG }]}>
      {/* Avatar */}
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.displayName}>{profile?.display_name ?? '—'}</Text>
        <Text style={styles.handle}>@{profile?.handle ?? '—'}</Text>
        {memberSince && (
          <Text style={styles.since}>Member since {memberSince}</Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('InviteManagement')}>
          <Text style={styles.rowLabel}>Invite Codes</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('PasswordSetup')}>
          <Text style={styles.rowLabel}>Password Login</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.row, styles.rowDanger]}
          onPress={handleSignOut}
          disabled={signingOut}>
          <Text style={styles.rowLabelDanger}>
            {signingOut ? 'Signing out…' : 'Sign Out'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  content: { padding: SPACE.LG, paddingTop: SPACE.LG },
  avatarWrap: { alignItems: 'center', paddingVertical: SPACE.XXL, gap: SPACE.SM },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.FULL,
    backgroundColor: C.ACCENT_LITE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.ACCENT,
    marginBottom: SPACE.SM,
  },
  avatarText: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD, color: C.ACCENT },
  displayName: { fontSize: FONT.SIZES.XL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  handle: { fontSize: FONT.SIZES.MD, color: C.MUTED, fontFamily: FONT.BODY },
  since: { fontSize: FONT.SIZES.SM, color: C.SUBTLE, fontFamily: FONT.BODY },
  section: {
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    marginBottom: SPACE.MD,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.BORDER,
  },
  divider: { height: 1, backgroundColor: C.BORDER, marginHorizontal: SPACE.LG },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACE.LG,
  },
  rowDanger: { justifyContent: 'center' },
  rowLabel: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM, color: C.INK },
  rowLabelDanger: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_SEMIBOLD, color: C.DANGER },
  rowChevron: { fontSize: FONT.SIZES.LG, color: C.MUTED },
});
