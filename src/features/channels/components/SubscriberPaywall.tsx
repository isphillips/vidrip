import React from 'react';
import { Text, StyleSheet, ScrollView, Image } from 'react-native';
import { C, FONT, SPACE } from '../../../theme';

// Neutral lock shown when a viewer opens a members channel they're not in.
//
// App Store 3.1.1 / reader-app compliance: this is a pure status screen. There is NO price, NO
// "subscribe", NO "join", NO outbound link, and NO mention of the web or any other purchase
// mechanism — it only states that the channel is restricted. Members who already have access never
// see this; they see the channel content directly (like signing in to a video service you already
// subscribe to). The app neither sells nor points to where to buy.
export default function SubscriberPaywall({ label }: { label: string }) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Image source={require('../../../assets/lock.png')} style={styles.lock} resizeMode="contain" />
      <Text style={styles.title}>Members only</Text>
      <Text style={styles.sub}>
        {label} is only available to members.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL, gap: SPACE.MD },
  lock: { width: 120, height: 120 },
  title: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  sub: { fontSize: FONT.SIZES.MD, color: C.MUTED, fontFamily: FONT.BODY, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
});
