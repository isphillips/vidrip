import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { useAuthStore } from '../../../store/authStore';
import {
  fetchChannelUpdatesSummary, type ChannelUpdateSummary,
} from '../../../infrastructure/supabase/queries/channels';

const GAP = 36; // px of empty space between repeated copies

// A seamless left-scrolling ticker. We render as many copies of the text as it takes to
// overflow the visible width (plus one spare), then translate the row by exactly ONE
// copy+gap and loop back instantly — so a fresh copy is always entering from the right
// with no gap. (The old 2-copy version popped the text back in on the right whenever the
// text was narrower than the row, which it usually is here.)
function Marquee({ text }: { text: string }) {
  const x = useRef(new Animated.Value(0)).current;
  const [textW, setTextW] = useState(0);
  const [wrapW, setWrapW] = useState(0);

  const unit = textW + GAP; // one copy + its trailing gap = the loop distance
  const copies = unit > 0 && wrapW > 0 ? Math.ceil(wrapW / unit) + 1 : 2;

  useEffect(() => {
    if (unit <= 0 || wrapW <= 0) { return; }
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: -unit, duration: unit * 22, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [unit, wrapW, text, x]);

  return (
    <View style={styles.marqueeWrap} onLayout={e => setWrapW(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.marqueeRow, { transform: [{ translateX: x }] }]}>
        {Array.from({ length: copies }).map((_, i) => (
          <React.Fragment key={i}>
            <Text
              numberOfLines={1}
              style={styles.marqueeText}
              onLayout={i === 0 ? e => setTextW(e.nativeEvent.layout.width) : undefined}>
              {text}
            </Text>
            <View style={{ width: GAP }} />
          </React.Fragment>
        ))}
      </Animated.View>
    </View>
  );
}

// Top-of-Feed informational block representing all the user's channels. Shows the total
// number of unseen channel updates and, when there are any, a scrolling ticker naming
// them. Tapping jumps to the Channels tab.
export default function ChannelsFeedBlock({ onPress }: { onPress: () => void }) {
  const { user } = useAuthStore();
  const [updates, setUpdates] = useState<ChannelUpdateSummary[]>([]);

  const load = useCallback(async () => {
    if (!user) { return; }
    setUpdates(await fetchChannelUpdatesSummary(user.id));
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = updates.reduce((n, c) => n + c.unseen_count, 0);
  const ticker = updates.map(c => `${c.unseen_count} new in ${c.name}`).join('     •     ');

  const active = total > 0;

  return (
    <TouchableOpacity style={[styles.block, active && styles.blockActive]} activeOpacity={0.85} onPress={onPress}>
      <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
        <Ionicons name="megaphone" size={20} color={active ? C.TEAL : C.MUTED} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Channels</Text>
          {active && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{total > 99 ? '99+' : total} update{total !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
        {active ? (
          <Marquee text={ticker} />
        ) : (
          <Text style={styles.subtitleMuted}>No new channel updates</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.MUTED} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  block: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.MD,
    backgroundColor: C.SURFACE,
    borderBottomWidth: 1, borderBottomColor: C.BORDER,
    paddingHorizontal: SPACE.LG, paddingVertical: SPACE.MD,
  },
  blockActive: { borderLeftWidth: 3, borderLeftColor: C.TEAL },
  iconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.SURFACE_2, alignItems: 'center', justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: C.ACCENT_LITE, borderWidth: 1, borderColor: C.TEAL },
  body: { flex: 1, gap: SPACE.XS, overflow: 'hidden' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM },
  title: { fontSize: FONT.SIZES.MD, fontFamily: FONT.DISPLAY_SEMIBOLD, color: C.INK },
  badge: {
    backgroundColor: C.TEAL, borderRadius: RADIUS.FULL,
    paddingHorizontal: SPACE.SM, paddingVertical: 1,
  },
  badgeText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_BOLD, color: C.BLACK },
  subtitleMuted: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED },
  marqueeWrap: { height: 18, overflow: 'hidden' },
  marqueeRow: { flexDirection: 'row', alignItems: 'center' },
  marqueeText: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, color: C.TEAL },
});
