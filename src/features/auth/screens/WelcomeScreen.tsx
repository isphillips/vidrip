import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Linking } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, interpolate } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT, SPACE, RADIUS, C } from '../../../theme';
import { TEXT_GLOW } from '../../../components/scene/sceneKit';
import { AuthScene } from '../components/AuthScene';
import GradientButton from '../../studio/components/GradientButton';
import { TERMS_URL, PRIVACY_URL } from '../../../constants/legal';
import type { AuthStackScreenProps } from '../../../app/navigation/types';

// "VI" stays white; "DRIP" runs the brand pink→purple ramp (matches the header/splash wordmark).
const DRIP_RAMP = [{ color: '#FF4FA3' }, { color: '#E04FC0' }, { color: '#BC5CE5' }, { color: '#A05CFF' }];

// Front door of Dripville: the shared slime-land scene + Drippy waving you in, the wordmark, and the
// two ways in. Buttons zoom-fade into the gated invite/login screens (AuthStack animation: 'fade').
export default function WelcomeScreen({ navigation }: AuthStackScreenProps<'Welcome'>) {
  const { bottom } = useSafeAreaInsets();
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [enter]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: interpolate(enter.value, [0, 1], [16, 0]) }],
  }));
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: interpolate(enter.value, [0, 1], [0.92, 1]) }],
  }));

  return (
    <View style={styles.root}>
      <AuthScene enter={enter} />

      {/* wordmark + tagline (Drippy floats above it from the scene) */}
      <Animated.View style={[styles.titleWrap, titleStyle]} pointerEvents="none">
        <Text style={styles.wordmark}>
          <Text style={styles.wmWhite}>VI</Text>
          {'DRIP'.split('').map((ch, i) => <Text key={i} style={DRIP_RAMP[i]}>{ch}</Text>)}
        </Text>
      </Animated.View>

      {/* the two ways in, anchored to the bottom */}
      <Animated.View style={[styles.actions, { paddingBottom: bottom + SPACE.LG }, actionsStyle]}>
        <GradientButton
          label="Enter Invitation Code"
          onPress={() => navigation.navigate('EnterInviteCode')}
          style={styles.button}
        />
        <TouchableOpacity style={styles.signInLink} activeOpacity={0.7} onPress={() => navigation.navigate('SignIn')}>
          <Text style={styles.signInText}>Already have an account? <Text style={styles.loginEm}>Log in</Text></Text>
        </TouchableOpacity>
        {/* EULA / terms agreement, presented before registering or signing in (App Store 1.2). */}
        <Text style={styles.legal}>
          By continuing, you agree to our{' '}
          <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>Terms of Use</Text>
          {' '}and{' '}
          <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy Policy</Text>.
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#160826', overflow: 'hidden' },

  titleWrap: { position: 'absolute', left: 0, right: 0, top: '52%', alignItems: 'center' },
  wordmark: { fontSize: 50, fontFamily: FONT.DISPLAY_BOLD, fontWeight: '700', letterSpacing: -1.5, ...TEXT_GLOW, textShadowRadius: 18 },
  wmWhite: { color: '#fff' },
  tagline: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: 'rgba(245,235,250,0.9)', letterSpacing: 2, marginTop: 6, textTransform: 'lowercase', ...TEXT_GLOW },

  actions: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SPACE.XL },
  button: { borderRadius: RADIUS.MD, overflow: 'hidden', marginBottom: SPACE.MD, width: '92%', alignSelf: 'center' },
  signInLink: { alignItems: 'center', padding: SPACE.SM },
  signInText: { color: C.WHITE, fontSize: FONT.SIZES.MD, fontFamily: FONT.BODY, ...TEXT_GLOW },
  loginEm: { color: '#FFD24A', fontFamily: FONT.BODY_BOLD },
  legal: {
    color: 'rgba(255,255,255,0.62)', fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY, width: 200, marginHorizontal: 'auto',
    textAlign: 'center', lineHeight: 17, paddingHorizontal: SPACE.LG, marginTop: SPACE.SM, marginBottom: SPACE.MD, ...TEXT_GLOW,
  },
  legalLink: { color: '#fff', fontFamily: FONT.BODY_SEMIBOLD, textDecorationLine: 'underline' },
});
