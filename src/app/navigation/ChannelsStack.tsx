import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { C } from '../../theme';
import type { ChannelsStackParamList } from './types';

import ChannelsHomeScreen from '../../features/channels/screens/ChannelsHomeScreen';
import ChannelScreen from '../../features/channels/screens/ChannelScreen';
import ChannelPostScreen from '../../features/channels/screens/ChannelPostScreen';
import WatchYouTubePostScreen from '../../features/channels/screens/WatchYouTubePostScreen';
import WatchChannelClipScreen from '../../features/channels/screens/WatchChannelClipScreen';
import RecordReviewScreen from '../../features/channels/screens/RecordReviewScreen';
import WatchReviewScreen from '../../features/channels/screens/WatchReviewScreen';
import ChannelReviewsScreen from '../../features/channels/screens/ChannelReviewsScreen';
import ChannelVideoRecordScreen from '../../features/channels/screens/ChannelVideoRecordScreen';
import AddChannelVideoScreen from '../../features/channels/screens/AddChannelVideoScreen';
import AddChannelMembersScreen from '../../features/channels/screens/AddChannelMembersScreen';
import InviteToChannelScreen from '../../features/channels/screens/InviteToChannelScreen';

const Stack = createNativeStackNavigator<ChannelsStackParamList>();

const NAV_OPTS = {
  headerStyle: { backgroundColor: C.BG },
  headerTintColor: C.INK,
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: C.BG },
};

export default function ChannelsNavigator() {
  return (
    <Stack.Navigator screenOptions={NAV_OPTS}>
      <Stack.Screen
        name="ChannelsHome"
        component={ChannelsHomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Channel"
        component={ChannelScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChannelPost"
        component={ChannelPostScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="WatchYouTubePost"
        component={WatchYouTubePostScreen}
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
      <Stack.Screen
        name="WatchChannelClip"
        component={WatchChannelClipScreen}
        options={{ headerShown: false, animation: 'slide_from_right', animationTypeForReplace: 'push' }}
      />
      <Stack.Screen
        name="RecordReview"
        component={RecordReviewScreen}
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
      <Stack.Screen
        name="WatchReview"
        component={WatchReviewScreen}
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
      <Stack.Screen
        name="ChannelReviews"
        component={ChannelReviewsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ChannelVideoRecord"
        component={ChannelVideoRecordScreen}
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
      <Stack.Screen
        name="AddChannelVideo"
        component={AddChannelVideoScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="AddChannelMembers"
        component={AddChannelMembersScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="InviteToChannel"
        component={InviteToChannelScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
