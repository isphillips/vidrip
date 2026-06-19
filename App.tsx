import React, { useEffect } from 'react';
import { StatusBar, View, Text, Image, StyleSheet, NativeModules } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HotUpdater } from '@hot-updater/react-native';
import RootNavigator from './src/app/navigation/RootNavigator';
import ScreenGradient from './src/components/ScreenGradient';
import UploadToast from './src/components/UploadToast';
import BakeQueueHost from './src/features/studio/components/BakeQueueHost';
import { SUPABASE_ANON_KEY } from './src/infrastructure/supabase/client';
import { C, FONT } from './src/theme';

function App() {
  // Preload the MediaPipe face model off the main thread so the first lens selection is instant.
  useEffect(() => { NativeModules.LensWarmup?.warmUp?.(); }, []);
  return (
    <GestureHandlerRootView style={styles.appRoot}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={C.BG_SOLID} />
        <RootNavigator />
        <UploadToast />
        <BakeQueueHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Shown while a force update downloads on launch (gates the stale bundle).
function UpdatingScreen({ progress = 0 }: { progress?: number }) {
  return (
    <ScreenGradient>
      <View style={updateStyles.container}>
        <Image source={require('./src/assets/driplogo.png')} style={updateStyles.logo} resizeMode="contain" />
        <Text style={updateStyles.title}>Setting the stage…</Text>
        <View style={updateStyles.track}>
          <View style={[updateStyles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </View>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: C.BG_SOLID },
});

const updateStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  logo: { width: 96, height: 159 },
  title: { color: C.WHITE, fontFamily: FONT.DISPLAY_SEMIBOLD, fontSize: FONT.SIZES.LG },
  track: { width: 160, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: '#E73D93' },
});

export default HotUpdater.wrap({
  baseURL: 'https://ltpscwticavqutbzrrjb.supabase.co/functions/v1/update-server',
  updateStrategy: 'appVersion',
  // Supabase Edge Function gateway requires the anon key to invoke the endpoint.
  requestHeaders: {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  },
  // On a FORCE update, hold here (showing progress) and reload into the new
  // bundle before the app renders — so a fresh install lands on the latest OTA
  // on first open instead of after a reopen. Deploy with `-f` to force.
  fallbackComponent: UpdatingScreen,
})(App);
