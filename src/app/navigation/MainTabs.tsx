import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { C } from '../../theme';
import MainTabBar from './MainTabBar';
import { useAuthStore } from '../../store/authStore';
import { fetchCanCreate } from '../../infrastructure/creatorStudio/api';
import type {
  MainTabParamList,
  FeedStackParamList,
  FriendsStackParamList,
  ShareStackParamList,
  AccountStackParamList,
} from './types';
import ChannelsNavigator from './ChannelsStack';
import { screenLayout } from '../../components/ScreenGradient';

import FeedHomeScreen from '../../features/feed/screens/FeedHomeScreen';
import ThreadScreen from '../../features/threads/screens/ThreadScreen';
import WatchReactionScreen from '../../features/threads/screens/WatchReactionScreen';
import WatchReviewScreen from '../../features/channels/screens/WatchReviewScreen';
import GiftRevealScreen from '../../features/exclusive/screens/GiftRevealScreen';
import ExclusiveCollectionScreen from '../../features/exclusive/screens/ExclusiveCollectionScreen';
import ExclusiveWatchScreen from '../../features/exclusive/screens/ExclusiveWatchScreen';
import FriendsHomeScreen from '../../features/friends/screens/FriendsHomeScreen';
import UserProfileScreen from '../../features/friends/screens/UserProfileScreen';
import AddFriendScreen from '../../features/friends/screens/AddFriendScreen';
import InviteManagementScreen from '../../features/friends/screens/InviteManagementScreen';
import ShareHomeScreen from '../../features/share/screens/ShareHomeScreen';
import AccountScreen from '../../features/account/screens/AccountScreen';
import EditProfileScreen from '../../features/account/screens/EditProfileScreen';
import PasswordSetupScreen from '../../features/account/screens/PasswordSetupScreen';
import TwoFactorScreen from '../../features/account/screens/TwoFactorScreen';
import AccountAdvancedScreen from '../../features/account/screens/AccountAdvancedScreen';
import { Image } from 'react-native';
import { useFeedStore } from '../../store/feedStore';
import { useShareUiStore } from '../../store/shareUiStore';

const tabIcon = (source: ReturnType<typeof require>, w = 28, h = 28) =>
  ({ color, focused }: { color: string; focused: boolean }) => (
    <Image
      source={source}
      style={{ width: w, height: h, opacity: focused ? 1 : 0.45, tintColor: color }}
      resizeMode="contain"
    />
  );

const Tab = createBottomTabNavigator<MainTabParamList>();
const FeedStack = createNativeStackNavigator<FeedStackParamList>();
const FriendsStack = createNativeStackNavigator<FriendsStackParamList>();
const ShareStack = createNativeStackNavigator<ShareStackParamList>();
const AccountStack = createNativeStackNavigator<AccountStackParamList>();

const NAV_OPTS = {
  headerStyle: { backgroundColor: C.BG },
  headerTintColor: C.INK,
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: C.BG },
};

function FeedNavigator() {
  return (
    <FeedStack.Navigator screenOptions={NAV_OPTS} screenLayout={screenLayout}>
      <FeedStack.Screen name="FeedHome" component={FeedHomeScreen} options={{ headerShown: false }} />
      <FeedStack.Screen name="Thread" component={ThreadScreen} options={{ headerShown: false }} />
      <FeedStack.Screen name="WatchReaction" component={WatchReactionScreen} options={{ headerShown: false, animation: 'slide_from_right', animationTypeForReplace: 'push' }} />
      <FeedStack.Screen name="WatchReview" component={WatchReviewScreen} options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <FeedStack.Screen name="GiftReveal" component={GiftRevealScreen} options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade' }} />
      <FeedStack.Screen name="ExclusiveCollection" component={ExclusiveCollectionScreen} options={{ headerShown: false }} />
      <FeedStack.Screen name="ExclusiveWatch" component={ExclusiveWatchScreen} options={{ headerShown: false }} />
    </FeedStack.Navigator>
  );
}

function FriendsNavigator() {
  return (
    <FriendsStack.Navigator screenOptions={NAV_OPTS} screenLayout={screenLayout}>
      <FriendsStack.Screen name="FriendsHome" component={FriendsHomeScreen} options={{ headerShown: false }} />
      <FriendsStack.Screen name="AddFriend" component={AddFriendScreen} options={{ title: '', headerBackTitle: 'Friends' }} />
      <FriendsStack.Screen name="Profile" component={UserProfileScreen} options={{ title: 'Profile', headerBackTitle: 'Friends' }} />
      <FriendsStack.Screen name="InviteManagement" component={InviteManagementScreen} options={{ title: '', headerBackTitle: 'Friends' }} />
    </FriendsStack.Navigator>
  );
}

function ShareNavigator() {
  return (
    <ShareStack.Navigator screenOptions={NAV_OPTS} screenLayout={screenLayout}>
      <ShareStack.Screen name="ShareHome" component={ShareHomeScreen} options={{ headerShown: false }} />
    </ShareStack.Navigator>
  );
}

function AccountNavigator() {
  return (
    <AccountStack.Navigator screenOptions={NAV_OPTS} screenLayout={screenLayout}>
      <AccountStack.Screen name="AccountHome" component={AccountScreen} options={{ headerShown: false }} />
      <AccountStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile', headerBackTitle: 'Account' }} />
      <AccountStack.Screen name="InviteManagement" component={InviteManagementScreen} options={{ title: '', headerBackTitle: 'Account' }} />
      <AccountStack.Screen name="PasswordSetup" component={PasswordSetupScreen} options={{ title: 'Password Login', headerBackTitle: 'Account' }} />
      <AccountStack.Screen name="TwoFactor" component={TwoFactorScreen} options={{ title: 'Two-Factor Auth', headerBackTitle: 'Account' }} />
      <AccountStack.Screen name="AccountAdvanced" component={AccountAdvancedScreen} options={{ title: 'Advanced', headerBackTitle: 'Account' }} />
    </AccountStack.Navigator>
  );
}

export default function MainTabs() {
  const { user } = useAuthStore();
  const [canCreate, setCanCreate] = useState(false);
  const toReact = useFeedStore(s => s.toReactCount);

  // The studio flag gates the center Create FAB + the Studio nav treatment. Refetch
  // on focus so an admin grant shows up without a full restart.
  useFocusEffect(
    React.useCallback(() => {
      if (user?.id) { fetchCanCreate(user.id).then(setCanCreate).catch(() => {}); }
    }, [user?.id]),
  );

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.SURFACE,
          borderTopColor: C.BORDER,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: C.DANGER,
        tabBarInactiveTintColor: C.WHITE,
        tabBarShowLabel: true,
      }}
      tabBar={(props) => <MainTabBar {...props} canCreate={canCreate} />}
    >
      <Tab.Screen name="Feed" component={FeedNavigator}
        listeners={({ navigation }) => ({
          // Always land on the feed list when the tab is tapped — otherwise opening a
          // video (Thread / WatchReview / Exclusive*) leaves the tab parked on that
          // screen and re-tapping Feed does nothing.
          tabPress: (e) => {
            e.preventDefault();
            (navigation as any).navigate('Feed', { screen: 'FeedHome' });
          },
        })}
        options={{
          tabBarIcon: tabIcon(require('../../assets/icon-feed.png')),
          tabBarLabel: 'Feed',
          tabBarBadge: toReact > 0 ? toReact : undefined,
          tabBarBadgeStyle: { backgroundColor: C.ACCENT_HOT, color: C.WHITE },
        }} />
      <Tab.Screen name="Channels" component={ChannelsNavigator}
        listeners={({ navigation }) => ({
          // Always land on the channels list when the tab is tapped — otherwise the
          // tab restores wherever its stack was left (e.g. a channel clip opened
          // from "My Reactions"), which surprises the user.
          tabPress: (e) => {
            e.preventDefault();
            (navigation as any).navigate('Channels', { screen: 'ChannelsHome' });
          },
        })}
        options={{ tabBarIcon: tabIcon(require('../../assets/icon-channels.png')), tabBarLabel: 'Channels' }} />
      <Tab.Screen name="Share" component={ShareNavigator}
        listeners={() => ({
          // Tapping Browse always returns to the browse view (even from the Paste
          // Link panel while the tab is already active).
          tabPress: () => { useShareUiStore.getState().requestBrowse(); },
        })}
        options={{ tabBarIcon: tabIcon(require('../../assets/icon-share.png')), tabBarLabel: 'Browse' }} />
      <Tab.Screen name="Friends" component={FriendsNavigator}
        listeners={({ navigation }) => ({
          // Tapping Friends always returns to the friends list, regardless of how
          // deep the stack is (Profile / AddFriend / InviteManagement).
          tabPress: (e) => {
            e.preventDefault();
            (navigation as any).navigate('Friends', { screen: 'FriendsHome' });
          },
        })}
        options={{ tabBarIcon: tabIcon(require('../../assets/icon-friends.png')), tabBarLabel: 'Friends' }} />
      <Tab.Screen name="Account" component={AccountNavigator}
        listeners={({ navigation }) => ({
          // Tapping Account always returns to the account home, regardless of how
          // deep the stack is (EditProfile / PasswordSetup / TwoFactor / etc).
          tabPress: (e) => {
            e.preventDefault();
            (navigation as any).navigate('Account', { screen: 'AccountHome' });
          },
        })}
        options={{ tabBarIcon: tabIcon(require('../../assets/icon-account.png')), tabBarLabel: 'Account' }} />
    </Tab.Navigator>
  );
}
