import React from 'react';
import { Text, type TextProps, StyleSheet } from 'react-native';
import { FONT } from '../theme';

type Variant = 'body' | 'display';
type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

interface Props extends TextProps {
  variant?: Variant;
  weight?: Weight;
}

const FAMILY: Record<Variant, Record<Weight, string>> = {
  body: {
    regular: FONT.BODY,
    medium: FONT.BODY_MEDIUM,
    semibold: FONT.BODY_SEMIBOLD,
    bold: FONT.BODY_BOLD,
  },
  display: {
    regular: FONT.DISPLAY,
    medium: FONT.DISPLAY_MEDIUM,
    semibold: FONT.DISPLAY_SEMIBOLD,
    bold: FONT.DISPLAY_BOLD,
  },
};

export default function AppText({
  variant = 'body',
  weight = 'regular',
  style,
  ...props
}: Props) {
  return (
    <Text
      style={[{ fontFamily: FAMILY[variant][weight] }, style]}
      {...props}
    />
  );
}
