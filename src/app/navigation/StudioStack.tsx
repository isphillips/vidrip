import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { C } from '../../theme';
import { screenLayout } from '../../components/ScreenGradient';
import type { StudioStackParamList } from './types';
import StudioHomeScreen from '../../features/studio/screens/StudioHomeScreen';
import StudioCaptureScreen from '../../features/studio/screens/StudioCaptureScreen';
import StudioTrimScreen from '../../features/studio/screens/StudioTrimScreen';
import StudioFilterScreen from '../../features/studio/screens/StudioFilterScreen';
import StudioOverlayScreen from '../../features/studio/screens/StudioOverlayScreen';
import StudioDetailsScreen from '../../features/studio/screens/StudioDetailsScreen';

const Stack = createNativeStackNavigator<StudioStackParamList>();

export default function StudioStack() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.BG } }}
      screenLayout={screenLayout}>
      <Stack.Screen name="StudioHome" component={StudioHomeScreen} />
      <Stack.Screen name="StudioCapture" component={StudioCaptureScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="StudioTrim" component={StudioTrimScreen} />
      <Stack.Screen name="StudioFilter" component={StudioFilterScreen} />
      <Stack.Screen name="StudioOverlay" component={StudioOverlayScreen} />
      <Stack.Screen name="StudioDetails" component={StudioDetailsScreen} />
    </Stack.Navigator>
  );
}
