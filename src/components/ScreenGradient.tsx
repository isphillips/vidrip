import React from 'react';
import { StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

// Diagonal purple background. Two tones: the lighter one for the hero surfaces
// (Welcome / Onboarding) and a darker one for the rest of the app.
export const GRADIENT_LIGHT = ['#2A0E4E', '#190A33', '#0B0518'];
export const GRADIENT_DARK = ['#170728', '#0C0418', '#030109'];

// App-wide background. Applied via each navigator's `screenLayout` so every screen
// gets its OWN opaque gradient — that keeps native-stack push/pop transitions clean
// (no see-through to the screen below), which a single shared overlay would not.
export default function ScreenGradient({ children, dark = false }: { children?: React.ReactNode; dark?: boolean }) {
  // Gradient is an absolute-fill BACKGROUND; content lives in a separate flex:1
  // layer on top. This decouples the screen's layout from the gradient view — if
  // LinearGradient ever measures late/zero during a transition, the content still
  // lays out normally (fixes "content sometimes doesn't show on load").
  return (
    <View style={styles.fill}>
      <LinearGradient
        colors={dark ? GRADIENT_DARK : GRADIENT_LIGHT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.fill}>{children}</View>
    </View>
  );
}

// Convenience for a navigator's `screenLayout` prop — uses the darker tone.
export const screenLayout = ({ children }: { children: React.ReactNode }) => (
  <ScreenGradient dark>{children}</ScreenGradient>
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
