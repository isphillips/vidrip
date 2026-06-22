import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { fetchUserProfile, type PublicProfile } from '../../../infrastructure/supabase/queries/profile';
import ContentActions from '../../../components/ContentActions';
import { useAuthStore } from '../../../store/authStore';
import type { FriendsStackScreenProps } from '../../../app/navigation/types';

export default function UserProfileScreen({ route }: FriendsStackScreenProps<'Profile'>) {
  const { userId } = route.params;
  const me = useAuthStore(s => s.user);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchUserProfile(userId)
      .then(p => { if (alive) { setProfile(p); } })
      .finally(() => { if (alive) { setLoading(false); } });
    return () => { alive = false; };
  }, [userId]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.ACCENT} /></View>;
  }
  if (!profile) {
    return <View style={styles.center}><Text style={styles.empty}>Profile unavailable.</Text></View>;
  }

  const initial = (profile.display_name || profile.handle || '?').charAt(0).toUpperCase();
  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {profile.avatar_url ? (
        <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
      )}
      <Text style={styles.displayName}>{profile.display_name}</Text>
      <Text style={styles.handle}>@{profile.handle}</Text>
      {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
      {!!profile.location && <Text style={styles.location}>📍 {profile.location}</Text>}
      {memberSince && <Text style={styles.since}>Member since {memberSince}</Text>}

      {/* Safety: report or block this person (hidden on your own profile). */}
      {userId !== me?.id && (
        <View style={styles.actions}>
          <ContentActions
            variant="inline"
            targetType="user"
            targetId={userId}
            targetUserId={userId}
            handle={profile.handle}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  content: { alignItems: 'center', padding: SPACE.XL, gap: SPACE.SM },
  center: { flex: 1, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center' },
  empty: { color: C.MUTED, fontFamily: FONT.BODY, fontSize: FONT.SIZES.MD },
  avatar: { width: 104, height: 104, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE_2, marginBottom: SPACE.SM },
  avatarFallback: {
    backgroundColor: C.ACCENT_LITE, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.ACCENT,
  },
  avatarText: { fontSize: FONT.SIZES.XXXL, fontFamily: FONT.DISPLAY_BOLD, color: C.ACCENT },
  displayName: { fontSize: FONT.SIZES.XL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  handle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.MUTED },
  bio: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.INK, textAlign: 'center', lineHeight: 22, marginTop: SPACE.SM, marginHorizontal: SPACE.LG },
  location: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED, marginTop: SPACE.XS },
  since: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.SUBTLE, marginTop: SPACE.XS },
  actions: { marginTop: SPACE.XL },
});
