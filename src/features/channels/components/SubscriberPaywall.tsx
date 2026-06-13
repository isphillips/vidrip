import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Linking, Alert, ScrollView } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import type { ChannelTier } from '../../../infrastructure/supabase/queries/channels';

const WEB_BASE = 'https://www.vidrip.app';

// Shown in place of a subscriber-mode channel's content when the viewer isn't an
// active subscriber. Subscriptions are sold on the web (link-out), not in-app.
export default function SubscriberPaywall({
  channelId, label, tiers,
}: { channelId: string; label: string; tiers: ChannelTier[] }) {
  const subscribe = () => {
    Linking.openURL(`${WEB_BASE}/c/${channelId}`)
      .catch(() => Alert.alert('Couldn’t open', 'Visit vidrip.app to subscribe.'));
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Image source={require('../../../assets/lock.png')} style={styles.lock} resizeMode="contain" />
      <Text style={styles.title}>Subscribers only</Text>
      <Text style={styles.sub}>
        Subscribe to {label} to unlock this room’s posts, reactions, and reviews.
      </Text>

      {tiers.length > 0 && (
        <View style={styles.tiers}>
          {tiers.map((t) => (
            <View key={t.id} style={styles.tier}>
              <Text style={styles.tierTitle} numberOfLines={1}>{t.title}</Text>
              <Text style={styles.tierPrice}>${(t.price_cents / 100).toFixed(2)}/mo</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.btn} onPress={subscribe} activeOpacity={0.85}>
        <Text style={styles.btnText}>Subscribe on the web</Text>
      </TouchableOpacity>
      <Text style={styles.fine}>Subscriptions are managed securely on vidrip.app.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL, gap: SPACE.MD },
  lock: { width: 120, height: 120 },
  title: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  sub: { fontSize: FONT.SIZES.MD, color: C.MUTED, fontFamily: FONT.BODY, textAlign: 'center', lineHeight: 22, marginBottom: SPACE.SM },
  tiers: { width: '100%', gap: SPACE.SM, marginBottom: SPACE.SM },
  tier: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER, borderRadius: RADIUS.MD,
    paddingVertical: SPACE.MD, paddingHorizontal: SPACE.LG,
  },
  tierTitle: { flex: 1, fontSize: FONT.SIZES.MD, color: C.INK, fontFamily: FONT.BODY_SEMIBOLD },
  tierPrice: { fontSize: FONT.SIZES.MD, color: C.ACCENT_HOT, fontFamily: FONT.BODY_BOLD, marginLeft: SPACE.MD },
  btn: { width: '100%', backgroundColor: C.ACCENT, borderRadius: RADIUS.MD, padding: SPACE.LG, alignItems: 'center', marginTop: SPACE.SM },
  btnText: { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
  fine: { fontSize: FONT.SIZES.XS, color: C.SUBTLE, fontFamily: FONT.BODY, textAlign: 'center' },
});
