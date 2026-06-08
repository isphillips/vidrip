import React from 'react';
import { StatusBar, View, Text, Image, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HotUpdater } from '@hot-updater/react-native';
import RootNavigator from './src/app/navigation/RootNavigator';
import { SUPABASE_ANON_KEY } from './src/infrastructure/supabase/client';
import { C, FONT } from './src/theme';

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={C.BG} />
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Shown while a force update downloads on launch (gates the stale bundle).
function UpdatingScreen({ progress = 0 }: { progress?: number }) {
  return (
    <View style={updateStyles.container}>
      <Image source={require('./src/assets/goldlogo.png')} style={updateStyles.logo} resizeMode="contain" />
      <Text style={updateStyles.title}>Setting the stage…</Text>
      <View style={updateStyles.track}>
        <View style={[updateStyles.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </View>
  );
}

const updateStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center', gap: 20 },
  logo: { width: 84, height: 90 },
  title: { color: C.GOLD, fontFamily: FONT.DISPLAY_SEMIBOLD, fontSize: FONT.SIZES.LG },
  track: { width: 160, height: 4, borderRadius: 2, backgroundColor: C.GOLD_DIM, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: C.GOLD },
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
