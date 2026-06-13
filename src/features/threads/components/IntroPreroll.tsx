import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Video from 'react-native-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveIntroUri } from '../../../infrastructure/storage/introStorage';
import { C, FONT, SPACE, RADIUS } from '../../../theme';

const SKIP_AFTER_MS = 3000;

/**
 * Full-screen intro pre-roll. Plays the sender's intro clip once on black, then
 * calls onDone. A Skip button fades in after ~3s. Reused before the recipient
 * records a reaction and before a reaction is watched. If the clip can't be
 * resolved/played, it fails open (calls onDone) so the main flow is never blocked.
 */
export default function IntroPreroll({
  introUrl, onDone,
}: { introUrl: string; onDone: () => void }) {
  const { top, bottom } = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(null);
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
    let alive = true;
    resolveIntroUri(introUrl)
      .then(resolved => {
        if (!alive) { return; }
        if (resolved) { setUri(resolved); } else { onDone(); }
      })
      .catch(() => { if (alive) { onDone(); } });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introUrl]);

  useEffect(() => {
    const t = setTimeout(() => setCanSkip(true), SKIP_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container}>
      {uri ? (
        <Video
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          paused={false}
          repeat={false}
          onEnd={onDone}
          onError={onDone}
        />
      ) : (
        <ActivityIndicator color={C.WHITE} size="large" />
      )}

      {/* "Intro" label */}
      <View style={[styles.badge, { top: top + SPACE.MD }]} pointerEvents="none">
        <Text style={styles.badgeText}>▶ Intro from your friend</Text>
      </View>

      {/* Skip — fades in after a few seconds */}
      {canSkip && uri && (
        <TouchableOpacity style={[styles.skip, { bottom: bottom + SPACE.XL }]} onPress={onDone} activeOpacity={0.85}>
          <Text style={styles.skipText}>Skip ›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, backgroundColor: C.BLACK, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: SPACE.MD, paddingVertical: SPACE.XS, borderRadius: RADIUS.FULL },
  badgeText: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM },
  skip: { position: 'absolute', right: SPACE.LG, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: SPACE.LG, paddingVertical: SPACE.SM, borderRadius: RADIUS.FULL, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  skipText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD },
});
