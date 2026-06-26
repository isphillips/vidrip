import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, Pressable, TouchableOpacity, Animated, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../theme';
import { useProfileDrawer } from '../store/profileDrawerStore';
import { useAuthStore } from '../store/authStore';
import {
  fetchUserProfile, fetchProfileByHandle, fetchProfileReactions, reactionThumbUrl,
  type PublicProfile, type ProfileReaction,
} from '../infrastructure/supabase/queries/profile';
import { fetchFriendStatus, sendFriendRequest, type FriendStatus } from '../infrastructure/supabase/queries/friends';
import { openReactionPlayer } from '../store/profileReactionPlayerStore';
import ContentActions from './ContentActions';

// Mounted once at the root. Any @handle tap calls openProfile({ userId | handle })
// to slide this up over everything.
export default function ProfileDrawer() {
  const target = useProfileDrawer(s => s.target);
  const close = useProfileDrawer(s => s.close);
  const me = useAuthStore(s => s.user);
  const { height } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none');
  const [sending, setSending] = useState(false);
  const [reactions, setReactions] = useState<ProfileReaction[]>([]);
  const translateY = useRef(new Animated.Value(height)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (target) {
      setMounted(true);
      setLoading(true);
      setProfile(null);
      setFriendStatus('none');
      setReactions([]);
      const p = target.userId ? fetchUserProfile(target.userId)
        : target.handle ? fetchProfileByHandle(target.handle)
        : Promise.resolve(null);
      let alive = true;
      p.then(async r => {
        if (!alive) { return; }
        setProfile(r);
        if (r?.id && me?.id && r.id !== me.id) {
          try { const st = await fetchFriendStatus(me.id, r.id); if (alive) { setFriendStatus(st); } } catch { /* ignore */ }
        }
        if (r?.id && r.show_reactions_in_profile) {
          try { const rx = await fetchProfileReactions(r.id, 6); if (alive) { setReactions(rx); } } catch { /* ignore */ }
        }
      }).finally(() => { if (alive) { setLoading(false); } });
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }),
        Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      return () => { alive = false; };
    }
    Animated.parallel([
      Animated.timing(translateY, { toValue: height, duration: 220, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setMounted(false));
  }, [target, height, translateY, backdrop]);

  const onAddFriend = async () => {
    if (!profile || sending || friendStatus !== 'none' || !me?.id) { return; }
    setSending(true);
    setFriendStatus('pending');   // optimistic
    try { await sendFriendRequest(me.id, profile.handle); }
    catch { setFriendStatus('none'); }
    finally { setSending(false); }
  };

  if (!mounted) { return null; }

  const initial = (profile?.display_name || profile?.handle || '?').charAt(0).toUpperCase();
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { paddingBottom: bottom + SPACE.LG, transform: [{ translateY }] }]}>
        <View style={styles.grabber} />
        {loading ? (
          <ActivityIndicator color={C.ACCENT} style={{ marginVertical: SPACE.XXXL }} />
        ) : !profile ? (
          <Text style={styles.empty}>Profile unavailable.</Text>
        ) : (
          <View style={styles.content}>
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

            {profile.id !== me?.id && (
              <TouchableOpacity
                style={[styles.friendBtn, friendStatus !== 'none' && styles.friendBtnDisabled]}
                disabled={friendStatus !== 'none' || sending}
                onPress={onAddFriend} activeOpacity={0.85}>
                <Ionicons
                  name={friendStatus === 'accepted' ? 'checkmark-circle' : friendStatus === 'pending' ? 'time-outline' : 'person-add'}
                  size={16} color={friendStatus !== 'none' ? C.MUTED : C.WHITE} />
                <Text style={[styles.friendBtnText, friendStatus !== 'none' && styles.friendBtnTextDisabled]}>
                  {friendStatus === 'accepted' ? 'Friends' : friendStatus === 'pending' ? 'Requested' : 'Add Friend'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Report / block this user (App Store 1.2 — UGC safety on every profile). */}
            {profile.id !== me?.id && (
              <View style={styles.actionsRow}>
                <ContentActions
                  variant="inline"
                  targetType="user"
                  targetId={profile.id}
                  targetUserId={profile.id}
                  handle={profile.handle}
                  onBlocked={close}
                />
              </View>
            )}

            {profile.show_reactions_in_profile && reactions.length > 0 && (
              <View style={styles.reactionsBlock}>
                <Text style={styles.reactionsLabel}>Latest Reactions</Text>
                <View style={styles.grid}>
                  {reactions.map(rx => {
                    const thumb = reactionThumbUrl(rx);
                    return (
                      <TouchableOpacity
                        key={rx.id} style={styles.tile} activeOpacity={0.8}
                        onPress={() => openReactionPlayer(rx.id)}>
                        {thumb ? (
                          <Image source={{ uri: thumb }} style={styles.tileImg} resizeMode="cover" />
                        ) : (
                          <View style={[styles.tileImg, styles.tileFallback]}>
                            <Ionicons name="play-circle" size={26} color={C.MUTED} />
                          </View>
                        )}
                        <View style={styles.tilePlay}>
                          <Ionicons name="play" size={14} color={C.WHITE} />
                        </View>
                        {!!rx.duration && (
                          <Text style={styles.tileDur}>{Math.round(rx.duration)}s</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: C.BG_SOLID, borderTopLeftRadius: RADIUS.LG, borderTopRightRadius: RADIUS.LG,
    paddingTop: SPACE.SM, paddingHorizontal: SPACE.XL,
    borderTopWidth: 1, borderColor: C.BORDER,
  },
  grabber: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.BORDER_STRONG, marginBottom: SPACE.LG,
  },
  content: { alignItems: 'center', gap: SPACE.XS, paddingBottom: SPACE.MD },
  empty: { color: C.MUTED, fontFamily: FONT.BODY, fontSize: FONT.SIZES.MD, textAlign: 'center', marginVertical: SPACE.XXL },
  avatar: { width: 96, height: 96, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE_2, marginBottom: SPACE.SM },
  avatarFallback: { backgroundColor: C.ACCENT_LITE, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.ACCENT },
  avatarText: { fontSize: FONT.SIZES.XXXL, fontFamily: FONT.DISPLAY_BOLD, color: C.ACCENT },
  displayName: { fontSize: FONT.SIZES.XL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  handle: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.ACCENT_HOT },
  bio: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.INK, textAlign: 'center', lineHeight: 22, marginTop: SPACE.SM },
  location: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED, marginTop: SPACE.XS },
  since: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.SUBTLE, marginTop: SPACE.XS },
  friendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.SM,
    backgroundColor: C.ACCENT, borderRadius: RADIUS.FULL,
    paddingVertical: SPACE.MD, paddingHorizontal: SPACE.XXL, marginTop: SPACE.LG,
  },
  friendBtnDisabled: { backgroundColor: C.SURFACE_2, borderWidth: 1, borderColor: C.BORDER },
  friendBtnText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
  friendBtnTextDisabled: { color: C.MUTED },
  actionsRow: { marginTop: SPACE.MD, alignItems: 'center' },
  reactionsBlock: { width: '100%', marginTop: SPACE.XL },
  reactionsLabel: {
    fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_BOLD, color: C.SUBTLE,
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: SPACE.SM,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.SM },
  tile: {
    width: '31.8%', aspectRatio: 3 / 4, borderRadius: RADIUS.SM, overflow: 'hidden',
    backgroundColor: C.SURFACE_2,
  },
  tileImg: { width: '100%', height: '100%' },
  tileFallback: { alignItems: 'center', justifyContent: 'center' },
  tilePlay: {
    position: 'absolute', top: SPACE.XS, left: SPACE.XS,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  tileDur: {
    position: 'absolute', bottom: SPACE.XS, right: SPACE.XS,
    fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM, color: C.WHITE,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 5, borderRadius: RADIUS.SM, overflow: 'hidden',
  },
});
