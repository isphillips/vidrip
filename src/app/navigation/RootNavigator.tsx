import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Linking, View } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';
import { C } from '../../theme';
import { supabase } from '../../infrastructure/supabase/client';
import { useAuthStore } from '../../store/authStore';
import { ensureReactionsDir } from '../../infrastructure/storage/localReactionStorage';
import {
  bootstrapNotifications,
  registerPushToken,
  unregisterPushToken,
  setNotificationOpenedHandler,
  setChannelNotificationHandler,
} from '../../infrastructure/notifications/pushService';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import RecordReactionScreen from '../../features/record/screens/RecordReactionScreen';

const Root = createNativeStackNavigator();

export default function RootNavigator() {
  const { session, isLoading, setSession, setProfile, setLoading } = useAuthStore();
  const navRef = useRef<NavigationContainerRef<any>>(null);

  // One-time setup
  useEffect(() => {
    ensureReactionsDir().catch(() => {});

    // Wire notification tap → navigate to thread
    setNotificationOpenedHandler((threadId: string) => {
      navRef.current?.navigate('Main', {
        screen: 'Feed',
        params: { screen: 'Thread', params: { threadId } },
      });
    });

    // Wire channel notification tap → navigate to private channel
    setChannelNotificationHandler((channelId: string, channelName: string) => {
      navRef.current?.navigate('Main', {
        screen: 'Channels',
        params: {
          screen: 'Channel',
          params: { channelId, channelName, isPublic: false, isJoined: true },
        },
      });
    });

    const cleanup = bootstrapNotifications();
    return cleanup;
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setTimeout(async () => {
        try {
          if (s?.user) {
            await fetchProfile(s.user.id);
            // Register for push notifications on sign-in
            registerPushToken(s.user.id).catch(() => {});
          } else {
            // Clear token on sign-out (user id needed — grab from previous session)
            setProfile(null);
          }
        } finally {
          setLoading(false);
        }
      }, 0);
    });

    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    Linking.getInitialURL().then((url) => {
      if (url) { handleDeepLink(url); }
    });

    return () => {
      subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) { setProfile(data); }
  };

  const handleDeepLink = async (url: string) => {
    if (!url.startsWith('reaxn://')) { return; }

    const hash = url.split('#')[1];
    if (hash) {
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        return;
      }
    }

    await supabase.auth.exchangeCodeForSession(url);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.ACCENT} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navRef}>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <>
            <Root.Screen name="Main" component={MainTabs} />
            <Root.Screen
              name="RecordReaction"
              component={RecordReactionScreen}
              options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
            />
          </>
        ) : (
          <Root.Screen name="Auth" component={AuthStack} />
        )}
      </Root.Navigator>
    </NavigationContainer>
  );
}
