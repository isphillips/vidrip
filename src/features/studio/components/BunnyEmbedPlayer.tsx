import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE } from '../../../theme';
import { signCreatorVideo, fetchOverlayRecipe } from '../../../infrastructure/creatorStudio/api';
import BunnyVideoLayer from './BunnyVideoLayer';
import ContentActions from '../../../components/ContentActions';
import { useAuthStore } from '../../../store/authStore';
import type { ReportTargetType } from '../../../infrastructure/supabase/queries/reports';
import type { OverlayRecipe } from '../effectRecipe';

// In-channel viewer for a creator (Bunny) video — signed embed + the animated overlay layer
// replayed live on top (via the shared BunnyVideoLayer). When the optional report* props are
// supplied (and the viewer isn't the author) it also shows a Report/Block control — UGC safety.
export default function BunnyEmbedPlayer({
  postId, title, onClose,
  reportTargetId, reportTargetUserId, reportHandle, reportTargetType = 'post',
}: {
  postId: string; title: string; onClose: () => void;
  reportTargetId?: string; reportTargetUserId?: string | null; reportHandle?: string | null;
  reportTargetType?: ReportTargetType;
}) {
  const { top } = useSafeAreaInsets();
  const { user } = useAuthStore();
  const canReport = !!reportTargetUserId && reportTargetUserId !== user?.id;
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

      {/* Report this video / block its creator — UGC safety (App Store 1.2). */}
      {canReport && (
        <View style={[styles.reportBtn, { top: top + SPACE.SM }]}>
          <ContentActions
            targetType={reportTargetType}
            targetId={reportTargetId ?? postId}
            targetUserId={reportTargetUserId}
            handle={reportHandle}
            color={C.WHITE}
            size={22}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  closeBtn: {
    position: 'absolute', left: SPACE.LG, width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)',
  },
  reportBtn: {
    position: 'absolute', right: SPACE.LG, width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)',
  },
  error: { color: C.MUTED, fontFamily: FONT.BODY, paddingHorizontal: SPACE.XL, textAlign: 'center' },
});
