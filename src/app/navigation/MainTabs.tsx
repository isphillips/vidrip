import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { C } from '../../theme';
import type {
  MainTabParamList,
  FeedStackParamList,
  FriendsStackParamList,
  ShareStackParamList,
  RecordStackParamList,
} from './types';

import FeedHomeScreen from '../../features/feed/screens/FeedHomeScreen';
import ThreadScreen from '../../features/threads/screens/ThreadScreen';
import FriendsHomeScreen from '../../features/friends/screens/FriendsHomeScreen';
import ShareHomeScreen from '../../features/share/screens/ShareHomeScreen';
import SelectRecipientsScreen from '../../features/share/screens/SelectRecipientsScreen';
import RecordReactionScreen from '../../features/record/screens/RecordReactionScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();
const FeedStack = createNativeStackNavigator<FeedStackParamList>();
const FriendsStack = createNativeStackNavigator<FriendsStackParamList>();
const ShareStack = createNativeStackNavigator<ShareStackParamList>();
const RecordStack = createNativeStackNavigator<RecordStackParamList>();

const NAV_OPTS = {
  headerStyle: { backgroundColor: C.BG },
  headerTintColor: C.INK,
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: C.BG },
};

function FeedNavigator() {
  return (
    <FeedStack.Navigator screenOptions={NAV_OPTS}>
      <FeedStack.Screen name="FeedHome" component={FeedHomeScreen} options={{ headerShown: false }} />
      <FeedStack.Screen name="Thread" component={ThreadScreen} options={{ title: '' }} />
    </FeedStack.Navigator>
  );
}

function FriendsNavigator() {
  return (
    <FriendsStack.Navigator screenOptions={NAV_OPTS}>
      <FriendsStack.Screen name="FriendsHome" component={FriendsHomeScreen} options={{ headerShown: false }} />
    </FriendsStack.Navigator>
  );
}

function ShareNavigator() {
  return (
    <ShareStack.Navigator screenOptions={NAV_OPTS}>
      <ShareStack.Screen name="ShareHome" component={ShareHomeScreen} options={{ title: 'share' }} />
      <ShareStack.Screen name="SelectRecipients" component={SelectRecipientsScreen} options={{ title: 'send to' }} />
    </ShareStack.Navigator>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.SURFACE,
          borderTopColor: C.BORDER,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: C.ACCENT,
        tabBarInactiveTintColor: C.SUBTLE,
        tabBarShowLabel: true,
      }}>
      <Tab.Screen
        name="Feed"
        component={FeedNavigator}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚡</Text>, tabBarLabel: 'feed' }}
      />
      <Tab.Screen
        name="Share"
        component={ShareNavigator}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>＋</Text>, tabBarLabel: 'share' }}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsNavigator}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>👥</Text>, tabBarLabel: 'friends' }}
      />
    </Tab.Navigator>
  );
}
