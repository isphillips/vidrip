import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Linking, View } from 'react-native';
import { C } from '../../theme';
import { supabase } from '../../infrastructure/supabase/client';
import { useAuthStore } from '../../store/authStore';
import { ensureReactionsDir } from '../../infrastructure/storage/localReactionStorage';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import RecordReactionScreen from '../../features/record/screens/RecordReactionScreen';

const Root = createNativeStackNavigator();

export default function RootNavigator() {
  const { session, isLoading, setSession, setProfile, setLoading } = useAuthStore();
  useEffect(() => {
    ensureReactionsDir().catch(() => {});
  }, []);

  useEffect(() => {
    // onAuthStateChange fires with INITIAL_SESSION on mount — covers both
    // cold start restore and magic link callback. No need for getSession().
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Defer DB calls — making Supabase queries directly inside onAuthStateChange
      // deadlocks because the auth client lock hasn't been released yet.
      setTimeout(async () => {
        try {
          if (s?.user) {
            await fetchProfile(s.user.id);
          } else {
            setProfile(null);
          }
        } finally {
          setLoading(false);
        }
      }, 0);
    });

    // Handle deep link when app is already open
    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    // Handle deep link that launched the app cold
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
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
    console.log('[DeepLink] received:', url);
    if (!url.startsWith('reaxn://')) { return; }

    // Magic links: reaxn://auth/callback#access_token=...&refresh_token=...
    const hash = url.split('#')[1];
    if (hash) {
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) console.warn('[DeepLink] setSession error:', error.message);
        else console.log('[DeepLink] session set via magic link');
        return;
      }
    }

    // PKCE flow: reaxn://auth/callback?code=...
    const { error } = await supabase.auth.exchangeCodeForSession(url);
    if (error) console.warn('[DeepLink] exchangeCode error:', error.message);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.BG, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.ACCENT} />
      </View>
    );
  }

  return (
    <NavigationContainer>
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
