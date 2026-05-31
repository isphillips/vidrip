import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import type { ShareStackScreenProps } from '../../../app/navigation/types';

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export default function ShareHomeScreen({ navigation }: ShareStackScreenProps<'ShareHome'>) {
  const [url, setUrl] = useState('');

  const handleNext = async () => {
    const videoId = extractYouTubeId(url.trim());
    if (!videoId) {
      Alert.alert('Invalid link', 'Paste a YouTube Shorts link to continue.');
      return;
    }

    // Fetch title via oEmbed (no API key needed)
    let title = 'YouTube Short';
    let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      );
      if (res.ok) {
        const data = await res.json();
        title = data.title ?? title;
        thumbnail = data.thumbnail_url ?? thumbnail;
      }
    } catch {
      // use defaults
    }

    navigation.navigate('SelectRecipients', { videoId, videoTitle: title, videoThumbnail: thumbnail });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>share a short</Text>
      <Text style={styles.subtitle}>paste a YouTube Shorts link</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="https://youtube.com/shorts/..."
        placeholderTextColor={C.SUBTLE}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <TouchableOpacity
        style={[styles.button, !url.trim() && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={!url.trim()}>
        <Text style={styles.buttonText}>choose friends →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, padding: SPACE.XL, paddingTop: SPACE.XXXL },
  title: { fontSize: FONT.SIZES.XXL, fontWeight: '700', color: C.INK, marginBottom: SPACE.XS },
  subtitle: { fontSize: FONT.SIZES.MD, color: C.MUTED, marginBottom: SPACE.XL },
  input: {
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    borderColor: C.BORDER,
    padding: SPACE.LG,
    fontSize: FONT.SIZES.MD,
    color: C.INK,
    marginBottom: SPACE.LG,
  },
  button: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontWeight: '700' },
});
