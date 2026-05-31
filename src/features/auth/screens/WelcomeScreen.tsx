import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Text } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT, SPACE, RADIUS } from '../../../theme';
import type { AuthStackScreenProps } from '../../../app/navigation/types';

const logo = require('../../../assets/logo.png');

// Old leather book palette
const LEATHER = {
  BASE:    '#1C0B06',   // deep mahogany — darkest base
  MID:     '#2E1208',   // warm mid-leather
  WARM:    '#3D1A0C',   // lighter leather highlight
  CREASE:  '#140804',   // shadow crease near-black
  AMBER:   '#5C2A10',   // faint amber warmth at centre
};

export default function WelcomeScreen({ navigation }: AuthStackScreenProps<'Welcome'>) {
  const { top } = useSafeAreaInsets();
  return (
    // Layer 1 — diagonal base gradient (simulates leather grain direction)
    <LinearGradient
      colors={[LEATHER.CREASE, LEATHER.MID, LEATHER.WARM, LEATHER.MID, LEATHER.CREASE]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.root}>

      {/* Layer 2 — top-to-bottom vignette, subtle darkening at edges */}
      <LinearGradient
        colors={[`${LEATHER.CREASE}99`, 'transparent', 'transparent', `${LEATHER.CREASE}99`]}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Layer 3 — faint warm amber bloom at centre-left (worn leather highlight) */}
      <LinearGradient
        colors={[`${LEATHER.AMBER}30`, 'transparent']}
        start={{ x: 0, y: 0.4 }}
        end={{ x: 0.7, y: 0.6 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Layer 4 — horizontal edge vignette */}
      <LinearGradient
        colors={[`${LEATHER.CREASE}80`, 'transparent', 'transparent', `${LEATHER.CREASE}80`]}
        locations={[0, 0.2, 0.8, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={[styles.content, { paddingTop: top + SPACE.LG }]}>
        <View style={styles.hero}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.tagline}>Share videos.{'\n'}Get reactions.</Text>
        </View>
        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('EnterInviteCode')}>
          <Text style={styles.buttonText}>Enter Invite Code</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.signInLink}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('SignIn')}>
          <Text style={styles.signInText}>Already have an account? Sign In</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    padding: SPACE.XL,
    paddingBottom: SPACE.XXXL,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACE.XL,
  },
  logo: {
    width: 240,
    height: 240,
  },
  tagline: {
    fontSize: FONT.SIZES.XL,
    fontFamily: FONT.DISPLAY_SEMIBOLD,
    color: '#C4A882',   // warm parchment — reads well on dark leather
    textAlign: 'center',
    lineHeight: 30,
    letterSpacing: 0.5,
  },
  button: {
    backgroundColor: '#8C1A14',
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    alignItems: 'center',
    marginBottom: SPACE.MD,
    borderWidth: 1,
    borderColor: '#C43C30',
  },
  buttonText: {
    color: '#F5EDE0',
    fontSize: FONT.SIZES.LG,
    fontFamily: FONT.BODY_BOLD,
    fontWeight: '700',
    letterSpacing: 1,
  },
  signInLink: {
    alignItems: 'center',
    padding: SPACE.SM,
  },
  signInText: {
    color: '#7A5A44',
    fontSize: FONT.SIZES.MD,
    fontFamily: FONT.BODY,
  },
});
