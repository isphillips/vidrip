import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import { postYouTubeToChannel } from '../../../infrastructure/supabase/queries/channels';
import { extractTikTokId, fetchTikTokMeta } from '../../../infrastructure/tiktok/api';
import { fetchYouTubeDurationSeconds, MAX_VIDEO_SECONDS } from '../../../infrastructure/youtube/api';
import type { ChannelsStackScreenProps } from '../../../app/navigation/types';

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) { return m[1]; }
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) { return trimmed; }
  return null;
}

async function fetchVideoTitle(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    );
    if (!res.ok) { return null; }
    const json = await res.json();
    return json.title ?? null;
  } catch {
    return null;
  }
}

export default function AddChannelVideoScreen({
  route, navigation,
}: ChannelsStackScreenProps<'AddChannelVideo'>) {
  const { channelId } = route.params;
  const { user } = useAuthStore();
  const { top, bottom } = useSafeAreaInsets();

  const [input, setInput] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'youtube' | 'tiktok'>('youtube');
  const [thumb, setThumb] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [posting, setPosting] = useState(false);
  // Reactive link check: gate Preview on a valid link within the 3-min limit
  // (YouTube only — TikTok duration isn't available via the public API → 'ok').
  const [linkStatus, setLinkStatus] =
    useState<'idle' | 'checking' | 'ok' | 'tooLong' | 'invalid'>('idle');

  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed) { setLinkStatus('idle'); return; }
    if (extractTikTokId(trimmed)) { setLinkStatus('ok'); return; }
    const id = extractVideoId(trimmed);
    if (!id) { setLinkStatus('invalid'); return; }
    setLinkStatus('checking');
    let cancelled = false;
    const t = setTimeout(async () => {
      const seconds = await fetchYouTubeDurationSeconds(id);
      if (cancelled) { return; }
      setLinkStatus(seconds != null && seconds > MAX_VIDEO_SECONDS ? 'tooLong' : 'ok');
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [input]);

  const handlePreview = useCallback(async () => {
    // TikTok first.
    const ttId = extractTikTokId(input);
    if (ttId) {
      setPreviewing(true);
      const meta = await fetchTikTokMeta(ttId);
      setVideoId(ttId);
      setTitle(meta?.title ?? 'TikTok');
      setThumb(meta?.thumbnail ?? null);
      setSourceType('tiktok');
      setPreviewing(false);
      return;
    }

    const id = extractVideoId(input);
    if (!id) {
      Alert.alert('Invalid URL', 'Paste a YouTube or TikTok link.');
      return;
    }
    setPreviewing(true);
    const t = await fetchVideoTitle(id);
    setVideoId(id);
    setTitle(t);
    setThumb(`https://img.youtube.com/vi/${id}/hqdefault.jpg`);
    setSourceType('youtube');
    setPreviewing(false);
  }, [input]);

  const handlePost = useCallback(async () => {
    if (!videoId || !user?.id) { return; }
    setPosting(true);
    try {
      await postYouTubeToChannel({
        channelId,
        userId: user.id,
        ytVideoId: videoId,
        ytVideoTitle: title,
        ytVideoThumbnail: thumb,
        sourceType,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not post video.');
      setPosting(false);
    }
  }, [videoId, user?.id, channelId, title, thumb, sourceType, navigation]);

  const thumbnail = thumb;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: top + SPACE.LG, paddingBottom: bottom + SPACE.XL }]}
        keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Add Video</Text>
          <View style={{ width: 52 }} />
        </View>

        <Text style={styles.label}>YouTube or TikTok URL</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={v => { setInput(v); setVideoId(null); setTitle(null); }}
            placeholder="Paste a YouTube or TikTok link"
            placeholderTextColor={C.SUBTLE}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handlePreview}
          />
          {linkStatus !== 'tooLong' && (
            <TouchableOpacity
              style={[styles.previewBtn, (linkStatus !== 'ok' || previewing) && styles.previewBtnDisabled]}
              onPress={handlePreview}
              disabled={linkStatus !== 'ok' || previewing}
              activeOpacity={0.8}>
              {(previewing || linkStatus === 'checking')
                ? <ActivityIndicator color={C.WHITE} size="small" />
                : <Text style={styles.previewBtnText}>Preview</Text>
              }
            </TouchableOpacity>
          )}
        </View>

        {/* Too-long message replaces the Preview action */}
        {linkStatus === 'tooLong' && (
          <View style={styles.tooLongBox}>
            <Text style={styles.tooLongTitle}>Video too long</Text>
            <Text style={styles.tooLongText}>
              We only allow videos up to 3 minutes (180 seconds). Please find a shorter video.
            </Text>
          </View>
        )}

        {/* Preview */}
        {thumbnail && (
          <View style={styles.preview}>
            <Image source={{ uri: thumbnail }} style={styles.previewThumb} resizeMode="cover" />
            {title && <Text style={styles.previewTitle} numberOfLines={2}>{title}</Text>}
          </View>
        )}

        {/* Post button */}
        {videoId && (
          <TouchableOpacity
            style={styles.postBtn}
            onPress={handlePost}
            disabled={posting}
            activeOpacity={0.85}>
            {posting
              ? <ActivityIndicator color={C.WHITE} />
              : <Text style={styles.postBtnText}>Post to Channel</Text>
            }
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.BG },
  container: { flex: 1, backgroundColor: C.BG },
  content: { paddingHorizontal: SPACE.LG, gap: SPACE.LG },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.SM,
  },
  cancel: { color: C.ACCENT_HOT, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM, width: 52 },
  screenTitle: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK },
  label: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  inputRow: { flexDirection: 'row', gap: SPACE.SM, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    borderWidth: 1, borderColor: C.BORDER,
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM,
    color: C.INK, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY,
  },
  previewBtn: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM + 2,
    minWidth: 72, alignItems: 'center',
  },
  previewBtnDisabled: { opacity: 0.4 },
  previewBtnText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },
  tooLongBox:   { backgroundColor: C.SURFACE, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.ACCENT_HOT, padding: SPACE.MD, gap: SPACE.XS },
  tooLongTitle: { color: C.ACCENT_HOT, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD },
  tooLongText:  { color: C.MUTED, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY },
  preview: { gap: SPACE.SM },
  previewThumb: {
    width: '100%', aspectRatio: 16 / 9,
    borderRadius: RADIUS.MD, backgroundColor: C.SURFACE_2,
  },
  previewTitle: {
    fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_MEDIUM,
    color: C.INK, lineHeight: 22,
  },
  postBtn: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    alignItems: 'center',
    marginTop: SPACE.SM,
  },
  postBtnText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD },
});
