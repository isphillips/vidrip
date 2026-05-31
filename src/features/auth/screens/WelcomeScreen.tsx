import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import type { AuthStackScreenProps } from '../../../app/navigation/types';

export default function WelcomeScreen({ navigation }: AuthStackScreenProps<'Welcome'>) {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>reaxn</Text>
        <Text style={styles.tagline}>share a short.{'\n'}get their reaction.</Text>
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('EnterInviteCode')}>
        <Text style={styles.buttonText}>enter invite code</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.BG,
    justifyContent: 'space-between',
    padding: SPACE.XL,
    paddingBottom: SPACE.XXXL,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 52,
    fontWeight: '800',
    color: C.ACCENT,
    letterSpacing: -2,
    marginBottom: SPACE.LG,
  },
  tagline: {
    fontSize: FONT.SIZES.XXL,
    fontWeight: '500',
    color: C.INK,
    lineHeight: 32,
  },
  button: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    alignItems: 'center',
  },
  buttonText: {
    color: C.WHITE,
    fontSize: FONT.SIZES.LG,
    fontWeight: '700',
  },
});
