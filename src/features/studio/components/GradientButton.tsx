import React from 'react';
import {
  Text, View, StyleSheet, TouchableOpacity, ActivityIndicator,
  type StyleProp, type ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';

// The brand gradient used across the app (wordmark, StudioHome, sticker pills).
const BRAND = ['#FF4FA3', '#A05CFF', '#3B82F6'];

// Brand-gradient call-to-action. `solid` (default) = filled gradient; `outline` = a thin gradient
// border over a transparent (brand-dark) fill — a quieter, secondary treatment. Built-in disabled
// (dim) + loading (spinner) states.
export default function GradientButton({
  label, onPress, disabled = false, loading = false, icon, style, variant = 'solid',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  variant?: 'solid' | 'outline';
}) {
  const dim = disabled || loading;
  // Keep the label + padding stable while loading (just swap the icon for a spinner) so the button
  // never collapses or blanks out mid-press.
  const content = (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator color={C.WHITE} style={styles.lead} />
      ) : icon ? (
        <Ionicons name={icon} size={20} color={C.WHITE} style={styles.lead} />
      ) : null}
      <Text style={styles.txt}>{label}</Text>
    </View>
  );
  return (
    <TouchableOpacity onPress={onPress} disabled={dim} activeOpacity={0.85} style={style}>
      <LinearGradient
        colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[variant === 'outline' ? styles.border : styles.btn, dim && styles.btnDisabled]}>
        {variant === 'outline' ? <View style={styles.outlineInner}>{content}</View> : content}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn:          { borderRadius: RADIUS.MD, alignItems: 'center', justifyContent: 'center' },
  // Outline: the gradient is just a 1.5px ring; the inner pill is the brand-dark bg (reads as transparent).
  border:       { borderRadius: RADIUS.MD, padding: 1.5 },
  outlineInner: { borderRadius: RADIUS.MD - 1.5, backgroundColor: C.BG_SOLID, alignItems: 'center', justifyContent: 'center' },
  btnDisabled:  { opacity: 0.5 },
  row:          { padding: SPACE.LG, flexDirection: 'row', alignItems: 'center' },
  lead:         { marginRight: 8 },
  txt:          { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
});
