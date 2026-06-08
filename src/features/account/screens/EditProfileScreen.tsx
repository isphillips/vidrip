import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { updateProfile, uploadAvatar } from '../../../infrastructure/supabase/queries/profile';
import { pickImage, type PickedImage } from '../../../infrastructure/media/imagePicker';
import AvatarCropper from '../components/AvatarCropper';
import type { AccountStackScreenProps } from '../../../app/navigation/types';

const BIO_MAX = 160;
const LOCATION_MAX = 60;
const NAME_MAX = 40;

export default function EditProfileScreen({ navigation }: AccountStackScreenProps<'EditProfile'>) {
  const { top } = useSafeAreaInsets();
  const { profile, user, setProfile } = useAuthStore();
  const p = profile as any;

  const [displayName, setDisplayName] = useState<string>(p?.display_name ?? '');
  const [bio, setBio] = useState<string>(p?.bio ?? '');
  const [location, setLocation] = useState<string>(p?.location ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(p?.avatar_url ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropTarget, setCropTarget] = useState<PickedImage | null>(null);

  const dirty =
    displayName.trim() !== (p?.display_name ?? '') ||
    bio !== (p?.bio ?? '') ||
    location !== (p?.location ?? '') ||
    avatarUrl !== (p?.avatar_url ?? null);

  const initial = (displayName || p?.handle || '?').charAt(0).toUpperCase();

  const handleChangePhoto = async () => {
    if (uploading) { return; }
    try {
      const picked = await pickImage();
      if (picked) { setCropTarget(picked); }
    } catch (e: any) {
      Alert.alert('Photo', e?.message ?? 'Could not open the photo picker.');
    }
  };

  const handleCropped = async (croppedUri: string) => {
    setCropTarget(null);
    if (!user?.id) { return; }
    setUploading(true);
    try {
      const url = await uploadAvatar(user.id, croppedUri, 'image/jpeg');
      setAvatarUrl(url);
    } catch (e: any) {
      Alert.alert('Photo', e?.message ?? 'Could not upload your photo.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id || !dirty || saving) { return; }
    if (!displayName.trim()) { Alert.alert('Name required', 'Please enter a display name.'); return; }
    setSaving(true);
    try {
      await updateProfile(user.id, {
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        location: location.trim() || null,
        avatar_url: avatarUrl,
      });
      if (profile) {
        setProfile({ ...(profile as any), display_name: displayName.trim(), bio: bio.trim() || null, location: location.trim() || null, avatar_url: avatarUrl });
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: top + SPACE.LG }]} keyboardShouldPersistTaps="handled">
        {/* Avatar */}
        <View style={styles.avatarWrap}>
          <TouchableOpacity onPress={handleChangePhoto} activeOpacity={0.85} disabled={uploading}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              {uploading
                ? <ActivityIndicator color={C.WHITE} size="small" />
                : <Text style={styles.avatarBadgeText}>✎</Text>}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleChangePhoto} disabled={uploading}>
            <Text style={styles.changePhoto}>{uploading ? 'Uploading…' : 'Change photo'}</Text>
          </TouchableOpacity>
        </View>

        {/* Display name */}
        <Text style={styles.label}>Display name</Text>
        <View style={styles.field}>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={t => setDisplayName(t.slice(0, NAME_MAX))}
            placeholder="Your name"
            placeholderTextColor={C.SUBTLE}
            autoCorrect={false}
          />
        </View>

        {/* Handle (read-only) */}
        <Text style={styles.label}>Handle</Text>
        <View style={[styles.field, styles.fieldDisabled]}>
          <Text style={styles.disabledText}>@{p?.handle ?? '—'}</Text>
        </View>

        {/* Bio */}
        <View style={styles.labelRow}>
          <Text style={styles.label}>Bio</Text>
          <Text style={styles.counter}>{bio.length}/{BIO_MAX}</Text>
        </View>
        <View style={styles.field}>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={bio}
            onChangeText={t => setBio(t.slice(0, BIO_MAX))}
            placeholder="Tell people about yourself"
            placeholderTextColor={C.SUBTLE}
            multiline
          />
        </View>

        {/* Location */}
        <Text style={styles.label}>Location</Text>
        <View style={styles.field}>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={t => setLocation(t.slice(0, LOCATION_MAX))}
            placeholder="City, region"
            placeholderTextColor={C.SUBTLE}
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!dirty || saving}>
          {saving
            ? <ActivityIndicator color={C.WHITE} />
            : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </ScrollView>

      {cropTarget && (
        <AvatarCropper
          image={cropTarget}
          onCancel={() => setCropTarget(null)}
          onDone={handleCropped}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  content: { padding: SPACE.LG },

  avatarWrap: { alignItems: 'center', gap: SPACE.SM, marginBottom: SPACE.XL },
  avatar: { width: 96, height: 96, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE_2 },
  avatarFallback: {
    backgroundColor: C.ACCENT_LITE, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.ACCENT,
  },
  avatarText: { fontSize: FONT.SIZES.XXXL, fontFamily: FONT.DISPLAY_BOLD, color: C.ACCENT },
  avatarBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 30, height: 30, borderRadius: 15, backgroundColor: C.ACCENT,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.BG,
  },
  avatarBadgeText: { color: C.WHITE, fontSize: FONT.SIZES.SM },
  changePhoto: { color: C.ACCENT_HOT, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },

  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  label: {
    fontSize: FONT.SIZES.SM, color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACE.SM, marginLeft: SPACE.XS, marginTop: SPACE.MD,
  },
  counter: { fontSize: FONT.SIZES.XS, color: C.SUBTLE, fontFamily: FONT.BODY, marginBottom: SPACE.SM },
  field: {
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD,
  },
  fieldDisabled: { opacity: 0.6 },
  disabledText: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.MUTED },
  input: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, color: C.INK, padding: 0 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },

  saveBtn: {
    backgroundColor: C.ACCENT, borderRadius: RADIUS.MD, alignItems: 'center',
    paddingVertical: SPACE.LG, marginTop: SPACE.XL,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD },
});
