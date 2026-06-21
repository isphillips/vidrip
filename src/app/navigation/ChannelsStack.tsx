import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { C } from '../../theme';
import { screenLayout, GRADIENT_DARK } from '../../components/ScreenGradient';
import type { ChannelsStackParamList } from './types';

import ChannelsHomeScreen from '../../features/channels/screens/ChannelsHomeScreen';
import ChannelScreen from '../../features/channels/screens/ChannelScreen';
import ChannelPostScreen from '../../features/channels/screens/ChannelPostScreen';
import WatchYouTubePostScreen from '../../features/channels/screens/WatchYouTubePostScreen';
import WatchChannelClipScreen from '../../features/channels/screens/WatchChannelClipScreen';
import WatchCreatorVideoScreen from '../../features/channels/screens/WatchCreatorVideoScreen';
import RecordReviewScreen from '../../features/channels/screens/RecordReviewScreen';
import WatchReviewScreen from '../../features/channels/screens/WatchReviewScreen';
import ChannelReviewsScreen from '../../features/channels/screens/ChannelReviewsScreen';
import ChannelVideoRecordScreen from '../../features/channels/screens/ChannelVideoRecordScreen';
import AddChannelVideoScreen from '../../features/channels/screens/AddChannelVideoScreen';
import AddChannelMembersScreen from '../../features/channels/screens/AddChannelMembersScreen';
import InviteToChannelScreen from '../../features/channels/screens/InviteToChannelScreen';
import ManageChannelMembersScreen from '../../features/channels/screens/ManageChannelMembersScreen';

const NAV_OPTS = {
  // Opaque dark backings (gradient's top/second tone), not transparent — a transparent
  // header flashes the OS's default light bar material during push/pop; contentStyle is
  // the dark backstop behind the screenLayout gradient. See MainTabs NAV_OPTS.
  headerStyle: { backgroundColor: GRADIENT_DARK[0] },
  headerTintColor: C.INK,
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: GRADIENT_DARK[1] },
};

// Every channel screen except the list root. Reused by the Channels tab AND the
// Messages stack so a private-chat conversation behaves identically and its back
// button returns to whichever list opened it (channel list vs. messages list).
function channelScreens(Stack: any) {
  return (
    <>
      <Stack.Screen name="Channel" component={ChannelScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ChannelPost" component={ChannelPostScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WatchYouTubePost" component={WatchYouTubePostScreen} options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="WatchChannelClip" component={WatchChannelClipScreen} options={{ headerShown: false, animation: 'slide_from_right', animationTypeForReplace: 'push' }} />
      <Stack.Screen name="WatchCreatorVideo" component={WatchCreatorVideoScreen} options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="RecordReview" component={RecordReviewScreen} options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="WatchReview" component={WatchReviewScreen} options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="ChannelReviews" component={ChannelReviewsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ChannelVideoRecord" component={ChannelVideoRecordScreen} options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="AddChannelVideo" component={AddChannelVideoScreen} options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="AddChannelMembers" component={AddChannelMembersScreen} options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="InviteToChannel" component={InviteToChannelScreen} options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="ManageChannelMembers" component={ManageChannelMembersScreen} options={{ headerShown: false, presentation: 'modal' }} />
    </>
  );
}

const Stack = createNativeStackNavigator<ChannelsStackParamList>();

export default function ChannelsNavigator() {
  return (
    <Stack.Navigator screenOptions={NAV_OPTS} screenLayout={screenLayout}>
      <Stack.Screen name="ChannelsHome" component={ChannelsHomeScreen} options={{ headerShown: false }} />
      {channelScreens(Stack)}
    </Stack.Navigator>
  );
}
