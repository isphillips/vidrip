import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { C } from '../../theme';
import { supabase } from '../../infrastructure/supabase/client';
import { useAuthStore } from '../../store/authStore';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import RecordReactionScreen from '../../features/record/screens/RecordReactionScreen';
import type { RecordStackParamList } from './types';

const Root = createNativeStackNavigator();
const RecordModal = createNativeStackNavigator<RecordStackParamList>();

export default function RootNavigator() {
  const { session, isLoading, setSession, setLoading } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

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
