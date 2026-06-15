import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE } from '../../../theme';
import { signCreatorVideo, fetchOverlayRecipe } from '../../../infrastructure/creatorStudio/api';
import BunnyVideoLayer from './BunnyVideoLayer';
import type { OverlayRecipe } from '../effectRecipe';

// In-channel viewer for a creator (Bunny) video — signed embed + the animated overlay layer
// replayed live on top (via the shared BunnyVideoLayer).
export default function BunnyEmbedPlayer({
  postId, title, onClose,
}: { postId: string; title: string; onClose: () => void }) {
  const { top } = useSafeAreaInsets();
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<OverlayRecipe | null>(null);

  useEffect(() => {
    signCreatorVideo(postId)
      .then(setEmbedUrl)
      .catch((e) => setError(e?.message ?? 'This video is unavailable.'));
    fetchOverlayRecipe(postId).then(setRecipe).catch(() => {});
  }, [postId]);

  return (
    <View style={styles.container}>
      {embedUrl && <BunnyVideoLayer embedUrl={embedUrl} recipe={recipe} />}

      {error && <Text style={styles.error}>{error}</Text>}
      {!embedUrl && !error && <ActivityIndicator color={C.ACCENT} style={StyleSheet.absoluteFill} />}

      <TouchableOpacity onPress={onClose} hitSlop={12} style={[styles.closeBtn, { top: top + SPACE.SM }]}>
        <Ionicons name="chevron-back" size={26} color={C.WHITE} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  closeBtn: {
    position: 'absolute', left: SPACE.LG, width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)',
  },
  error: { color: C.MUTED, fontFamily: FONT.BODY, paddingHorizontal: SPACE.XL, textAlign: 'center' },
});
