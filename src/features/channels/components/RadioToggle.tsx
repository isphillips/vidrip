import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';

type Props = {
  options: string[];
  value: string;
  onChange: (v: string) => void;
};

export default function RadioToggle({ options, value, onChange }: Props) {
  return (
    <View style={styles.track}>
      {options.map(opt => {
        const active = opt === value;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onChange(opt)}
            activeOpacity={0.8}>
            <Text style={[styles.label, active && styles.labelActive]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Mirrors the Browse/Paste Link segmented toggle on the Share screen.
const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.MD,
    padding: 3,
    gap: 3,
  },
  pill: {
    flex: 1,
    paddingVertical: SPACE.SM,
    alignItems: 'center',
    borderRadius: RADIUS.SM,
  },
  pillActive: {
    backgroundColor: C.ACCENT,
  },
  label: {
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY_SEMIBOLD,
    color: C.MUTED,
  },
  labelActive: {
    color: C.WHITE,
  },
});
