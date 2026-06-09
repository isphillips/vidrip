import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT, SPACE, RADIUS, C } from '../../../theme';
import CurtainStage from '../../../components/CurtainStage';
import type { AuthStackScreenProps } from '../../../app/navigation/types';

const logo = require('../../../assets/logo.png');

export default function WelcomeScreen({ navigation }: AuthStackScreenProps<'Welcome'>) {
  const { top } = useSafeAreaInsets();
  return (
    <CurtainStage>
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
    </CurtainStage>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#140804',
    marginLeft: -3,
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,6,5,0.55)' },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    padding: SPACE.XL,
    paddingBottom: 300,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACE.MD,
  },
  logo: {
    width: 240,
    height: 240,
  },
  tagline: {
    fontSize: FONT.SIZES.XL,
    fontFamily: FONT.DISPLAY_SEMIBOLD,
    color: '#C4A882',
    textAlign: 'center',
    lineHeight: 30,
    letterSpacing: 0.5,
  },
  button: {
    backgroundColor: C.GOLD,
    borderRadius: RADIUS.MD,
    padding: SPACE.LG,
    alignItems: 'center',
    marginBottom: SPACE.MD,
    borderWidth: 1,
    borderColor: '#C43C30',
    marginTop: -30,
    width: '90%',
    alignSelf: 'center',
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
    color: '#F5EDE0',
    fontSize: FONT.SIZES.MD,
    fontFamily: FONT.BODY,
  },
});
