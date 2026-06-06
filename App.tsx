import React from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HotUpdater } from '@hot-updater/react-native';
import RootNavigator from './src/app/navigation/RootNavigator';
import { SUPABASE_ANON_KEY } from './src/infrastructure/supabase/client';
import { C } from './src/theme';

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

export default HotUpdater.wrap({
  baseURL: 'https://ltpscwticavqutbzrrjb.supabase.co/functions/v1/update-server',
  updateStrategy: 'appVersion',
  // Supabase Edge Function gateway requires the anon key to invoke the endpoint.
  requestHeaders: {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  },
})(App);
