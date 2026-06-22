import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../../features/auth/screens/WelcomeScreen';
import SignInScreen from '../../features/auth/screens/SignInScreen';
import EnterInviteCodeScreen from '../../features/auth/screens/EnterInviteCodeScreen';
import CreateProfileScreen from '../../features/auth/screens/CreateProfileScreen';
import type { AuthStackParamList } from './types';
import { C } from '../../theme';
import { screenLayout, GRADIENT_DARK } from '../../components/ScreenGradient';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator
      screenLayout={screenLayout}
      screenOptions={{
        // Opaque dark header/content (gradient's top/second tone), NOT transparent. A
        // transparent bar makes iOS render its light translucent material for a frame
        // during the push — that's the back-button "white flash" on SignIn. Mirrors the
        // MainTabs / ChannelsStack navigators.
        headerStyle: { backgroundColor: GRADIENT_DARK[0] },
        headerTintColor: C.INK,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: GRADIENT_DARK[1] },
      }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: '' }} />
      <Stack.Screen name="EnterInviteCode" component={EnterInviteCodeScreen} options={{ title: '' }} />
      <Stack.Screen name="CreateProfile" component={CreateProfileScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}
