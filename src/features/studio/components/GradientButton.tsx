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

// Primary call-to-action button for the creator flow — brand gradient fill,
// with built-in disabled (dim) and loading (spinner) states.
export default function GradientButton({
  label, onPress, disabled = false, loading = false, icon, style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const dim = disabled || loading;
  return (
    <TouchableOpacity onPress={onPress} disabled={dim} activeOpacity={0.9} style={style}>
      <LinearGradient
        colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[styles.btn, dim && styles.btnDisabled]}>
        {/* Keep the label + padding stable while loading (just swap the icon for a spinner) so the
            button never collapses or blanks out mid-press. */}
        <View style={styles.row}>
          {loading ? (
            <ActivityIndicator color={C.WHITE} style={styles.lead} />
          ) : icon ? (
            <Ionicons name={icon} size={20} color={C.WHITE} style={styles.lead} />
          ) : null}
          <Text style={styles.txt}>{label}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn:         { borderRadius: RADIUS.MD, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.5 },
  row:         { padding: SPACE.LG, flexDirection: 'row', alignItems: 'center' },
  lead:        { marginRight: 8 },
  txt:         { color: C.WHITE, fontSize: FONT.SIZES.LG, fontFamily: FONT.BODY_BOLD, fontWeight: '700' },
});
