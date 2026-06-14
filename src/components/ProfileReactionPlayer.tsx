import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, Pressable, ActivityIndicator, Text, TouchableOpacity, useWindowDimensions, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE } from '../theme';
import { useProfileReactionPlayer } from '../store/profileReactionPlayerStore';
import { signProfileReaction } from '../infrastructure/supabase/queries/profile';

// Mounted once at the root. Plays a profile reaction full-screen over everything,
// using a server-signed URL (works even for non-members when the owner opted in).
export default function ProfileReactionPlayer() {
  const reactionId = useProfileReactionPlayer(s => s.reactionId);
  const close = useProfileReactionPlayer(s => s.close);
  const { width, height } = useWindowDimensions();
  const { top } = useSafeAreaInsets();

  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!reactionId) { setUri(null); setError(false); setPaused(false); return; }
    let alive = true;
    setUri(null); setError(false); setPaused(false);
    signProfileReaction(reactionId)
      .then(u => { if (alive) { if (u) { setUri(u); } else { setError(true); } } })
      .catch(() => { if (alive) { setError(true); } });
    return () => { alive = false; };
  }, [reactionId]);

  if (!reactionId) { return null; }

  return (
    <View style={styles.container}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setPaused(p => !p)}>
        {uri ? (
          <Video
            source={{ uri }}
            style={{ width, height }}
            resizeMode="contain"
            paused={paused}
            mixWithOthers="mix"
            disableFocus={Platform.OS === 'android'}
            onEnd={close}
            onError={() => setError(true)}
            repeat={false}
          />
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>This reaction is no longer available.</Text>
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={C.ACCENT} size="large" />
          </View>
        )}
      </Pressable>

      <TouchableOpacity
        style={[styles.back, { top: top + SPACE.SM }]}
        onPress={close} hitSlop={12} activeOpacity={0.8}>
        <Ionicons name="chevron-back" size={26} color={C.WHITE} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, backgroundColor: C.BLACK, zIndex: 1000 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: C.MUTED, fontFamily: FONT.BODY, fontSize: FONT.SIZES.MD, paddingHorizontal: SPACE.XXL, textAlign: 'center' },
  back: {
    position: 'absolute', left: SPACE.LG,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
});
