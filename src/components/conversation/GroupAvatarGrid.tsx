import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { C, FONT } from '../../theme';
import type { GroupMember } from '../../infrastructure/supabase/queries/channels';

const S = 48;
const HALF = S / 2;

// Renders up to 4 member avatars inside a clipped circle, iOS Messages-style.
// 1 member → full circle; 2 → left/right split; 3 → top pair + bottom full; 4 → 2×2 grid.
// Members without an avatar URL fall back to a colored initial circle inside their slot.
export default function GroupAvatarGrid({ members }: { members: GroupMember[] }) {
  const shown = members.slice(0, 4);

  if (shown.length === 0) {
    return (
      <View style={[styles.wrap, styles.fallback]}>
        <Text style={styles.fallbackText}>👥</Text>
      </View>
    );
  }

  if (shown.length === 1) {
    return (
      <View style={styles.wrap}>
        <MemberSlot member={shown[0]} width={S} height={S} />
      </View>
    );
  }

  if (shown.length === 2) {
    return (
      <View style={[styles.wrap, styles.row]}>
        <MemberSlot member={shown[0]} width={HALF} height={S} />
        <MemberSlot member={shown[1]} width={HALF} height={S} />
      </View>
    );
  }

  if (shown.length === 3) {
    return (
      <View style={styles.wrap}>
        <View style={styles.row}>
          <MemberSlot member={shown[0]} width={HALF} height={HALF} />
          <MemberSlot member={shown[1]} width={HALF} height={HALF} />
        </View>
        <MemberSlot member={shown[2]} width={S} height={HALF} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, styles.grid]}>
      {shown.map((m, i) => (
        <MemberSlot key={i} member={m} width={HALF} height={HALF} />
      ))}
    </View>
  );
}

// Image members fill their slot edge-to-edge; initial-only members render as a
// centered circle (actual borderRadius) so they look like the 1:1 fallback avatar.
function MemberSlot({ member, width, height }: { member: GroupMember; width: number; height: number }) {
  if (member.url) {
    return <Image source={{ uri: member.url }} style={{ width, height }} resizeMode="cover" />;
  }
  const sz = Math.min(width, height) - 4;
  return (
    <View style={[styles.slotBg, { width, height }]}>
      <View style={[styles.initialCircle, { width: sz, height: sz, borderRadius: sz / 2 }]}>
        <Text style={styles.initialText}>{member.initial}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: S, height: S, borderRadius: S / 2,
    overflow: 'hidden', backgroundColor: C.SURFACE_2,
    borderWidth: 2, borderColor: C.BORDER,
  },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { fontSize: FONT.SIZES.LG },
  row: { flexDirection: 'row' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  slotBg: { backgroundColor: C.SURFACE_2, alignItems: 'center', justifyContent: 'center' },
  initialCircle: {
    backgroundColor: C.ACCENT_LITE,
    borderWidth: 1.5, borderColor: C.ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  initialText: { fontSize: FONT.SIZES.XS, fontFamily: FONT.DISPLAY_BOLD, color: C.ACCENT },
});
