import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../../features/auth/screens/WelcomeScreen';
import SignInScreen from '../../features/auth/screens/SignInScreen';
import EnterInviteCodeScreen from '../../features/auth/screens/EnterInviteCodeScreen';
import CreateProfileScreen from '../../features/auth/screens/CreateProfileScreen';
import type { AuthStackParamList } from './types';
import { C } from '../../theme';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: C.BG },
        headerTintColor: C.INK,
        headerShadowVisible: false,
        headerBackTitleVisible: false,
        contentStyle: { backgroundColor: C.BG },
      }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: '' }} />
      <Stack.Screen name="EnterInviteCode" component={EnterInviteCodeScreen} options={{ title: '' }} />
      <Stack.Screen name="CreateProfile" component={CreateProfileScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}
