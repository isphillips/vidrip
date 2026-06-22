import React from 'react';
import { View, Text, Image, StyleSheet, ScrollView } from 'react-native';
import { C, FONT, SPACE } from '../../../theme';
import type { ChannelTier } from '../../../infrastructure/supabase/queries/channels';

// Shown in place of a subscriber-mode channel's content when the viewer isn't an
// active subscriber. Reader-style: the content is simply locked — NO prices, NO
// purchase button, and NO payment call-to-action in-app, per App Store (3.1.1) and
// Google Play payments policy. Subscriptions are managed entirely on the web; the
// app makes no reference to buying. (Props are kept stable for the call site.)
export default function SubscriberPaywall({
  label,
}: { channelId: string; label: string; tiers: ChannelTier[] }) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Image source={require('../../../assets/lock.png')} style={styles.lock} resizeMode="contain" />
      <Text style={styles.title}>Subscribers only</Text>
      <Text style={styles.sub}>
        This room’s posts, reactions, and reviews are available to {label} subscribers.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL, gap: SPACE.MD },
  lock: { width: 120, height: 120 },
  title: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  sub: { fontSize: FONT.SIZES.MD, color: C.MUTED, fontFamily: FONT.BODY, textAlign: 'center', lineHeight: 22, marginBottom: SPACE.SM },
});
