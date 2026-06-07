import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../theme';

/** Thin double rule with a center diamond — Art-Deco section break. */
export function DecoDivider({ width = 120 }: { width?: number }) {
  return (
    <View style={[s.dividerRow, { width }]}>
      <View style={s.dividerLine} />
      <View style={s.diamond} />
      <View style={s.dividerLine} />
    </View>
  );
}

/** Uppercase, letter-spaced gold kicker above a headline. */
export function Kicker({ children }: { children: React.ReactNode }) {
  return <Text style={s.kicker}>{children}</Text>;
}

/** Diamond progress pips. */
export function Pips({ count, active }: { count: number; active: number }) {
  return (
    <View style={s.pips}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[s.pip, i === active && s.pipActive]} />
      ))}
    </View>
  );
}

type BtnProps = {
  label: string;
  onPress: () => void;
  variant?: 'solid' | 'outline' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
};
/** Gold Art-Deco button. solid = filled gold, outline = gold border, ghost = text only. */
export function DecoButton({ label, onPress, variant = 'outline', loading, disabled }: BtnProps) {
  return (
    <TouchableOpacity
      style={[
        s.btn,
        variant === 'solid' && s.btnSolid,
        variant === 'outline' && s.btnOutline,
        variant === 'ghost' && s.btnGhost,
        disabled && s.btnDisabled,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled || loading}>
      {loading
        ? <ActivityIndicator color={variant === 'solid' ? C.BG : C.GOLD} size="small" />
        : <Text style={[s.btnText, variant === 'solid' ? s.btnTextSolid : s.btnTextGold, variant === 'ghost' && s.btnTextGhost]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  dividerRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: SPACE.SM },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.GOLD_DIM },
  diamond: { width: 7, height: 7, backgroundColor: C.GOLD, transform: [{ rotate: '45deg' }] },

  kicker: {
    fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_SEMIBOLD, color: C.GOLD,
    letterSpacing: 3, textTransform: 'uppercase', textAlign: 'center',
  },

  pips: { flexDirection: 'row', gap: SPACE.SM, alignSelf: 'center' },
  pip: {
    width: 6, height: 6, transform: [{ rotate: '45deg' }],
    borderWidth: 1, borderColor: C.GOLD_DIM, backgroundColor: C.TRANSPARENT,
  },
  pipActive: { backgroundColor: C.GOLD, borderColor: C.GOLD },

  btn: {
    minHeight: 52, borderRadius: RADIUS.SM, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACE.XL,
  },
  btnSolid: { backgroundColor: C.GOLD },
  btnOutline: { borderWidth: 1, borderColor: C.GOLD, backgroundColor: 'rgba(201,162,75,0.06)' },
  btnGhost: { },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY_BOLD, letterSpacing: 1 },
  btnTextSolid: { color: C.BG },
  btnTextGold: { color: C.GOLD },
  btnTextGhost: { color: C.MUTED, fontFamily: FONT.BODY_MEDIUM, letterSpacing: 0.5 },
});
