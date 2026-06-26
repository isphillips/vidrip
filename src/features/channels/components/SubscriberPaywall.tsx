import React from 'react';
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { isUSStorefront } from '../../../utils/storefront';
import { SHOW_WEB_JOIN_LINK } from '../config';

// Neutral members-only lock shown when a viewer opens a members channel they're not in.
//
// App Store 3.1.1 compliance: there is NO price, NO "subscribe", and NO payment language anywhere in
// the app — membership is handled entirely on the web. We ship as a pure neutral lock with no outbound
// link (SHOW_WEB_JOIN_LINK = false). When that flag is enabled AND the user is on the US storefront
// (the 2025 external-link allowance), we surface a plain "Join on the web" link; nowhere else.
export default function SubscriberPaywall({
  channelId, label,
}: { channelId: string; label: string }) {
  const showWebLink = SHOW_WEB_JOIN_LINK && isUSStorefront();
  // TODO(web): confirm the public channel join URL path.
  const openWeb = () => Linking.openURL(`https://www.vidrip.app/c/${channelId}`).catch(() => {});

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Image source={require('../../../assets/lock.png')} style={styles.lock} resizeMode="contain" />
      <Text style={styles.title}>Members only</Text>
      <Text style={styles.sub}>
        {label} is a members-only channel. Membership is handled on the web.
      </Text>
      {showWebLink && (
        <TouchableOpacity style={styles.webBtn} onPress={openWeb} activeOpacity={0.85}>
          <Text style={styles.webBtnTxt}>Join on the web</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.XL, gap: SPACE.MD },
  lock: { width: 120, height: 120 },
  title: { fontSize: FONT.SIZES.XXL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  sub: { fontSize: FONT.SIZES.MD, color: C.MUTED, fontFamily: FONT.BODY, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  webBtn: {
    marginTop: SPACE.SM, paddingHorizontal: SPACE.XL, paddingVertical: SPACE.MD,
    borderRadius: RADIUS.FULL, borderWidth: 1, borderColor: C.BORDER_STRONG,
  },
  webBtnTxt: { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },
});
