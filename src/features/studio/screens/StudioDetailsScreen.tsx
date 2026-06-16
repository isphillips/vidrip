import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Animated, Modal, Share,
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
import GradientButton from '../components/GradientButton';
import EffectPlayer from '../components/EffectPlayer';
import ShareBaker, { type ShareBakerHandle } from '../components/ShareBaker';
import { isEmptyRecipe } from '../effectRecipe';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

export default function StudioDetailsScreen({ route, navigation }: StudioStackScreenProps<'StudioDetails'>) {
  const { fileUri, recipe, durationSec } = route.params;
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [title, setTitle]           = useState('');
  const [channels, setChannels]     = useState<PostableChannel[]>([]);
  const [channelId, setChannelId]   = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [uploaded, setUploaded]       = useState(false);
  const [fullscreen, setFullscreen]   = useState(false);
  const [sharing, setSharing]         = useState(false);
  const bakerRef = useRef<ShareBakerHandle>(null);
  const progress  = useRef(new Animated.Value(0)).current;
  const uploadRef = useRef<UploadHandle | null>(null);

  useEffect(() => {
    if (!user?.id) { return; }
    fetchPostableChannels(user.id)
      .then(cs => {
        setChannels(cs);
        const first = cs[0] ?? null;
        setChannelId(first?.id ?? null);
        if (first?.isMembersOnly) { setVisibility('subscribers'); }
      })
      .catch(() => {})
      .finally(() => setLoadingChannels(false));
  }, [user?.id]);

  useEffect(() => () => uploadRef.current?.abort(), []);

  const selectChannel = (ch: PostableChannel) => {
    if (uploading) { return; }
    setChannelId(ch.id);
    if (ch.isMembersOnly) { setVisibility('subscribers'); }
  };

  const selectedChannel = channels.find(c => c.id === channelId) ?? null;
  const subscribersOnly = selectedChannel?.isMembersOnly ?? false;

  const post = async () => {
    if (!channelId || uploading) { return; }
    setUploading(true);
    progress.setValue(0);
    try {
      // Thumbnail is best-effort AND time-boxed — a hung thumbnail upload must never stall the
      // post (the progress bar sits at 0% during this pre-upload phase).
      let thumbUrl: string | undefined;
      try {
        thumbUrl = await Promise.race([
          (async () => {
            const { path } = await createThumbnail({ url: fileUri, timeStamp: 1000, format: 'jpeg' });
            return await uploadCreatorThumbnail(path);
          })(),
          new Promise<undefined>((_, rej) => setTimeout(() => rej(new Error('thumb timeout')), 8000)),
        ]);
      } catch { /* best-effort — proceed without a custom thumbnail */ }
      const create = await createCreatorVideo(channelId, title.trim() || 'Untitled', visibility, thumbUrl, recipe ?? null);
      const { promise, handle } = uploadCreatorVideo({
        create, fileUri, title: title.trim() || 'Untitled',
        onProgress: (f) => Animated.timing(progress, { toValue: f, duration: 120, useNativeDriver: false }).start(),
      });
      uploadRef.current = handle;
      await promise;
      // Bytes are up. Bunny encodes server-side (the webhook flips it to 'ready' for the
      // channel), but the local baked file is identical and plays instantly — so show a
      // success card with the video playing right away instead of a bare alert.
      setUploaded(true);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Something went wrong. Try again.');
      setUploading(false);
    }
  };

  // Bake the overlay into the MP4 (only when sharing OUT) then open the OS share sheet.
  const shareWithEffects = async () => {
    if (sharing || uploading) { return; }
    setSharing(true);
    try {
      const out = isEmptyRecipe(recipe)
        ? fileUri
        : await bakerRef.current!.bake({ sourceUri: fileUri, recipe, durationSec: durationSec ?? 0 });
      await Share.share({ url: out });
    } catch (e: any) {
      Alert.alert('Share failed', e?.message ?? 'Could not prepare the video.');
    } finally {
      setSharing(false);
    }
  };

  const widthPct   = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
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
        <View style={styles.previewBox}>
          {/* The look (trim/colour/mirror) is baked into fileUri; the animated overlay layer
              is replayed live on top from the recipe — exact match to the editor, 60fps. */}
          <EffectPlayer
            uri={fileUri}
            recipe={recipe}
            paused={fullscreen || uploaded}
            style={StyleSheet.absoluteFill}
          />
          <TouchableOpacity style={styles.fullscreenBtn} onPress={() => setFullscreen(true)} hitSlop={8}>
            <View style={styles.fullscreenBg}>
              <Ionicons name="expand-outline" size={18} color="#fff" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={shareWithEffects} disabled={sharing} hitSlop={8}>
            <View style={styles.fullscreenBg}>
              {sharing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="share-outline" size={18} color="#fff" />}
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input} value={title} onChangeText={setTitle}
          placeholder="Give it a title…" placeholderTextColor={C.SUBTLE} maxLength={120} editable={!uploading}
        />

        <Text style={styles.label}>Channel</Text>
        {loadingChannels
          ? <ActivityIndicator color={C.ACCENT} style={{ alignSelf: 'flex-start' }} />
          : noChannels
            ? <Text style={styles.hint}>You don't own a channel yet. Create one first to publish.</Text>
            : channels.map(ch => {
                const active = ch.id === channelId;
                return (
                  <TouchableOpacity key={ch.id} style={[styles.choice, active && styles.choiceActive]}
                    onPress={() => selectChannel(ch)} activeOpacity={0.8}>
                    <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={18}
                      color={active ? C.ACCENT_HOT : C.SUBTLE} />
                    <Text style={[styles.choiceText, active && styles.choiceTextActive]} numberOfLines={1}>{ch.name}</Text>
                    {ch.isMembersOnly && (
                      <View style={styles.membersBadge}>
                        <Ionicons name="lock-closed" size={11} color={C.ACCENT_HOT} />
                        <Text style={styles.membersBadgeTxt}>Subs only</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
        }

        <Text style={styles.label}>Who can watch</Text>
        {subscribersOnly && (
          <Text style={styles.hint}>This channel is subscribers-only. All posts are locked.</Text>
        )}
        <View style={styles.toggle}>
          {(['public', 'subscribers'] as Visibility[]).map(v => {
            const active   = visibility === v;
            const disabled = uploading || (v === 'public' && subscribersOnly);
            return (
              <TouchableOpacity key={v}
                style={[styles.toggleBtn, active && styles.toggleBtnActive, disabled && styles.toggleBtnDisabled]}
                onPress={() => { if (!disabled) { setVisibility(v); } }}
                activeOpacity={disabled ? 1 : 0.8}>
                <Ionicons name={v === 'public' ? 'globe-outline' : 'lock-closed'} size={16}
                  color={active ? C.WHITE : disabled ? C.SUBTLE : C.MUTED} />
                <Text style={[styles.toggleText, active && styles.toggleTextActive, disabled && styles.toggleTextDisabled]}>
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
        <GradientButton
          label={uploading ? 'Uploading…' : 'Post video'}
          onPress={post}
          disabled={uploading || noChannels || !channelId}
        />
      </View>

      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)}
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}>
        <View style={styles.fsContainer}>
          <Video
            source={{ uri: fileUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            controls
            repeat
            paused={false}
          />
          <TouchableOpacity style={styles.fsClose} onPress={() => setFullscreen(false)} hitSlop={12}>
            <View style={styles.fsCloseBg}>
              <Ionicons name="close" size={22} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Upload-complete confirmation with an instant, looping preview of the finished
          video (local baked file — plays immediately while Bunny finishes encoding). */}
      <Modal visible={uploaded} animationType="fade" transparent
        supportedOrientations={['portrait']}
        onRequestClose={() => navigation.navigate('StudioHome')}>
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={46} color={C.ACCENT_HOT} />
            <Text style={styles.successTitle}>Uploaded 🎬</Text>
            <Text style={styles.successSub}>
              {selectedChannel
                ? `Processing now — going live in ${selectedChannel.name} shortly.`
                : 'Processing now — going live shortly.'}
            </Text>
            <View style={styles.successPreview}>
              {uploaded && (
                <EffectPlayer uri={fileUri} recipe={recipe} paused={false} style={StyleSheet.absoluteFill} />
              )}
            </View>
            <View style={styles.successActions}>
              <TouchableOpacity style={styles.successShare} onPress={shareWithEffects} disabled={sharing} activeOpacity={0.85}>
                {sharing
                  ? <ActivityIndicator size="small" color={C.INK} />
                  : <><Ionicons name="share-outline" size={18} color={C.INK} /><Text style={styles.successShareTxt}>Share</Text></>}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <GradientButton label="Done" onPress={() => navigation.navigate('StudioHome')} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Off-screen; only renders while baking the overlay into a shareable MP4. */}
      <ShareBaker ref={bakerRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.LG },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.MD },
  title:     { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  body:      { paddingBottom: SPACE.XXXL },

  previewBox: {
    height: 300,
    aspectRatio: 9 / 16,
    alignSelf: 'center',
    borderRadius: RADIUS.MD,
    backgroundColor: '#000',
    overflow: 'hidden',
    marginBottom: SPACE.LG,
  },
  fullscreenBtn: { position: 'absolute', bottom: 10, right: 10 },
  shareBtn:      { position: 'absolute', top: 10, right: 10 },
  fullscreenBg:  { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: 6 },

  label: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED, marginTop: SPACE.MD, marginBottom: SPACE.SM },
  input: {
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    padding: SPACE.LG, fontSize: FONT.SIZES.MD, color: C.INK, fontFamily: FONT.BODY,
  },
  hint: { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.SM, marginBottom: SPACE.SM },

  choice: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.SM,
    backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER,
    paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG, marginBottom: SPACE.SM,
  },
  choiceActive:    { borderColor: C.ACCENT },
  choiceText:      { flex: 1, fontSize: FONT.SIZES.MD, color: C.MUTED, fontFamily: FONT.BODY_MEDIUM },
  choiceTextActive:{ color: C.INK },
  membersBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.SURFACE_2, paddingHorizontal: 6, paddingVertical: 3, borderRadius: RADIUS.FULL },
  membersBadgeTxt: { color: C.ACCENT_HOT, fontFamily: FONT.BODY_SEMIBOLD, fontSize: 10 },

  toggle:             { flexDirection: 'row', gap: SPACE.SM },
  toggleBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.SM, paddingVertical: SPACE.MD, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE },
  toggleBtnActive:    { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
  toggleBtnDisabled:  { opacity: 0.35 },
  toggleText:         { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_SEMIBOLD, color: C.MUTED },
  toggleTextActive:   { color: C.WHITE },
  toggleTextDisabled: { color: C.SUBTLE },

  footer:        { paddingBottom: SPACE.LG },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: C.SURFACE_2, overflow: 'hidden', marginBottom: SPACE.SM },
  progressFill:  { height: 6, borderRadius: 3, backgroundColor: C.ACCENT_HOT },

  fsContainer: { flex: 1, backgroundColor: '#000' },
  fsClose:     { position: 'absolute', top: 52, right: 20 },
  fsCloseBg:   { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, padding: 8 },

  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: SPACE.LG },
  successCard:    { width: '100%', maxWidth: 360, backgroundColor: C.BG, borderRadius: RADIUS.MD, padding: SPACE.LG, alignItems: 'center', borderWidth: 1, borderColor: C.BORDER },
  successTitle:   { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK, marginTop: SPACE.SM },
  successSub:     { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED, textAlign: 'center', marginTop: SPACE.SM, marginBottom: SPACE.MD },
  successPreview: { height: 300, aspectRatio: 9 / 16, borderRadius: RADIUS.MD, backgroundColor: '#000', overflow: 'hidden' },
  successActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, marginTop: SPACE.LG, width: '100%' },
  successShare:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, backgroundColor: C.SURFACE },
  successShareTxt:{ color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
});
