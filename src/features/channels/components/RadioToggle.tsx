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

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: C.SURFACE,
    borderRadius: RADIUS.FULL,
    borderWidth: 1,
    borderColor: C.BORDER,
    padding: 3,
    alignSelf: 'center',
  },
  pill: {
    paddingHorizontal: SPACE.LG,
    paddingVertical: SPACE.XS + 2,
    borderRadius: RADIUS.FULL,
  },
  pillActive: {
    backgroundColor: C.ACCENT,
  },
  label: {
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY_MEDIUM,
    color: C.MUTED,
  },
  labelActive: {
    color: C.WHITE,
  },
});
