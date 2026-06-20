import React from 'react';
import {
  Text, View, StyleSheet, TouchableOpacity, ActivityIndicator,
  type StyleProp, type ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
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
  // Outline: mask a full-bleed gradient to a rounded-rect ring, so the WHOLE border is a gradient and
  // the centre is genuinely transparent (the screen shows through). Diagonal so the gradient flows
  // around the border. The label sits on top of the mask.
  if (variant === 'outline') {
    return (
      <TouchableOpacity onPress={onPress} disabled={dim} activeOpacity={0.85} style={style}>
        <View style={[styles.outlineWrap, dim && styles.btnDisabled]}>
          <MaskedView style={StyleSheet.absoluteFill} maskElement={<View style={styles.ring} />}>
            <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          </MaskedView>
          {content}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} disabled={dim} activeOpacity={0.85} style={style}>
      <LinearGradient
        colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[styles.btn, dim && styles.btnDisabled]}>
        {content}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn:          { borderRadius: RADIUS.MD, alignItems: 'center', justifyContent: 'center' },
  outlineWrap:  { borderRadius: RADIUS.MD, alignItems: 'center', justifyContent: 'center' },
  // Mask: opaque rounded border (shows the gradient) around a transparent centre (hides it).
  ring:         { flex: 1, borderRadius: RADIUS.MD, borderWidth: 1.5, borderColor: '#000', backgroundColor: 'transparent' },
  btnDisabled:  { opacity: 0.5 },
  row:          { padding: SPACE.LG, flexDirection: 'row', alignItems: 'center' },
  lead:         { marginRight: 8 },
  txt:          { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
});
