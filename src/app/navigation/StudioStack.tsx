import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { C } from '../../theme';
import { screenLayout } from '../../components/ScreenGradient';
import type { StudioStackParamList } from './types';
import StudioHomeScreen from '../../features/studio/screens/StudioHomeScreen';
import StudioDetailsScreen from '../../features/studio/screens/StudioDetailsScreen';
import StudioPlayerScreen from '../../features/studio/screens/StudioPlayerScreen';

const Stack = createNativeStackNavigator<StudioStackParamList>();

export default function StudioStack() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.BG } }}
      screenLayout={screenLayout}>
      <Stack.Screen name="StudioHome" component={StudioHomeScreen} />
      <Stack.Screen name="StudioDetails" component={StudioDetailsScreen} />
      <Stack.Screen name="StudioPlayer" component={StudioPlayerScreen} options={{ animation: 'slide_from_bottom' }} />
    </Stack.Navigator>
  );
}
