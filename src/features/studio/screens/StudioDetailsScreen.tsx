import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Animated,
} from 'react-native';
import Video from 'react-native-video';
import { createThumbnail } from 'react-native-create-thumbnail';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  createCreatorVideo, uploadCreatorVideo, fetchPostableChannels, uploadCreatorThumbnail,
  type PostableChannel, type Visibility, type UploadHandle,
} from '../../../infrastructure/creatorStudio/api';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

export default function StudioDetailsScreen({ route, navigation }: StudioStackScreenProps<'StudioDetails'>) {
  const { fileUri } = route.params;
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [title, setTitle] = useState('');
  const [channels, setChannels] = useState<PostableChannel[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [uploading, setUploading] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const uploadRef = useRef<UploadHandle | null>(null);

  useEffect(() => {
    if (!user?.id) { return; }
    fetchPostableChannels(user.id)
      .then(cs => { setChannels(cs); setChannelId(cs[0]?.id ?? null); })
      .catch(() => {})
      .finally(() => setLoadingChannels(false));
  }, [user?.id]);

  useEffect(() => () => uploadRef.current?.abort(), []);

  const post = async () => {
    if (!channelId || uploading) { return; }
    setUploading(true);
    progress.setValue(0);
    try {
      // Generate + host a cover from the source video (Bunny's own thumbnail is gated).
      let thumbUrl: string | undefined;
      try {
        const { path } = await createThumbnail({ url: fileUri, timeStamp: 1000, format: 'jpeg' });
        thumbUrl = await uploadCreatorThumbnail(path);
      } catch { /* cover is best-effort */ }
      const create = await createCreatorVideo(channelId, title.trim() || 'Untitled', visibility, thumbUrl);
      const { promise, handle } = uploadCreatorVideo({
        create, fileUri, title: title.trim() || 'Untitled',
        onProgress: (f) => Animated.timing(progress, { toValue: f, duration: 120, useNativeDriver: false }).start(),
      });
      uploadRef.current = handle;
      await promise;
      Alert.alert('Uploaded 🎬', 'Your video is processing and will go live shortly.');
      navigation.navigate('StudioHome');
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Something went wrong. Try again.');
      setUploading(false);
    }
  };

  const widthPct = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const noChannels = !loadingChannels && channels.length === 0;

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => !uploading && navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={uploading ? C.SUBTLE : C.INK} />
        </TouchableOpacity>
        <Text style={styles.title}>New video</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Video source={{ uri: fileUri }} style={styles.preview} resizeMode="contain" paused repeat muted controls />

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input} value={title} onChangeText={setTitle}
          placeholder="Give it a title…" placeholderTextColor={C.SUBTLE} maxLength={120} editable={!uploading}
        />

        <Text style={styles.label}>Channel</Text>
        {loadingChannels ? <ActivityIndicator color={C.ACCENT} style={{ alignSelf: 'flex-start' }} />
          : noChannels ? <Text style={styles.hint}>You don’t own a channel yet. Create one first to publish.</Text>
          : channels.map(ch => {
            const active = ch.id === channelId;
            return (
              <TouchableOpacity key={ch.id} style={[styles.choice, active && styles.choiceActive]}
                onPress={() => !uploading && setChannelId(ch.id)} activeOpacity={0.8}>
                <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18} color={active ? C.ACCENT_HOT : C.SUBTLE} />
                <Text style={[styles.choiceText, active && styles.choiceTextActive]} numberOfLines={1}>{ch.name}</Text>
              </TouchableOpacity>
            );
          })}

        <Text style={styles.label}>Who can watch</Text>
        <View style={styles.toggle}>
          {(['public', 'subscribers'] as Visibility[]).map(v => {
            const active = visibility === v;
            return (
              <TouchableOpacity key={v} style={[styles.toggleBtn, active && styles.toggleBtnActive]}
                onPress={() => !uploading && setVisibility(v)} activeOpacity={0.8}>
                <Ionicons name={v === 'public' ? 'globe-outline' : 'lock-closed'} size={16} color={active ? C.WHITE : C.MUTED} />
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                  {v === 'public' ? 'Public' : 'Subscribers'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {uploading && (
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: widthPct }]} />
          </View>
        )}
        <TouchableOpacity
          style={[styles.postBtn, (uploading || noChannels || !channelId) && styles.postBtnDisabled]}
          onPress={post} disabled={uploading || noChannels || !channelId} activeOpacity={0.85}>
          {uploading
            ? <Text style={styles.postBtnText}>Uploading…</Text>
            : <Text style={styles.postBtnText}>Post video</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.LG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.MD },
  title: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  body: { paddingBottom: SPACE.XXXL },
  preview: { width: '100%', aspectRatio: 16 / 9, borderRadius: RADIUS.MD, backgroundColor: '#000', marginBottom: SPACE.LG },
  label: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED, marginTop: SPACE.MD, marginBottom: SPACE.SM },
  input: {
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    padding: SPACE.LG, fontSize: FONT.SIZES.MD, color: C.INK, fontFamily: FONT.BODY,
  },
  hint: { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.SM },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG, marginBottom: SPACE.SM,
  },
  choiceActive: { borderColor: C.ACCENT },
  choiceText: { flex: 1, fontSize: FONT.SIZES.MD, color: C.MUTED, fontFamily: FONT.BODY_MEDIUM },
  choiceTextActive: { color: C.INK },
  toggle: { flexDirection: 'row', gap: SPACE.SM },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.SM,
    paddingVertical: SPACE.MD, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE,
  },
  toggleBtnActive: { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
  toggleText: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  toggleTextActive: { color: C.WHITE },
  footer: { paddingVertical: 0, paddingBottom: SPACE.LG },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: C.SURFACE_2, overflow: 'hidden', marginBottom: SPACE.SM },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: C.ACCENT_HOT },
  postBtn: { backgroundColor: C.ACCENT, borderRadius: RADIUS.MD, padding: SPACE.LG, alignItems: 'center' },
  postBtnDisabled: { opacity: 0.4 },
  postBtnText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
});
