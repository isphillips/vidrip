import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Linking, View } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';
import { C } from '../../theme';
import { supabase } from '../../infrastructure/supabase/client';
import { useAuthStore } from '../../store/authStore';
import { useOAuthStore } from '../../store/oauthStore';
import { useShareIntentStore } from '../../store/shareIntentStore';
import { parseOAuthDeepLink } from '../../infrastructure/oauth/config';
import { ensureReactionsDir } from '../../infrastructure/storage/localReactionStorage';
import {
  bootstrapNotifications,
  registerPushToken,
  setNotificationOpenedHandler,
  setChannelNotificationHandler,
} from '../../infrastructure/notifications/pushService';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import StudioStack from './StudioStack';
import MfaChallengeScreen from '../../features/auth/screens/MfaChallengeScreen';
import RecordReactionScreen from '../../features/record/screens/RecordReactionScreen';
import RecordCommentScreen from '../../features/comments/screens/RecordCommentScreen';
import RecordIntroScreen from '../../features/share/screens/RecordIntroScreen';
import OnboardingScreen from '../../features/onboarding/OnboardingScreen';
import ScreenGradient from '../../components/ScreenGradient';
import { useOnboarding, useOnboardingStore } from '../../features/onboarding/onboarding';

const Root = createNativeStackNavigator();

// Dark purple base so cold-start / any uncovered area matches the app gradient
// (instead of the default white/black flash).
const navTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.BG_SOLID } };

export default function RootNavigator() {
  const { session, isLoading, setSession, setProfile, setLoading } = useAuthStore();
  const { ready: onbReady, seen: onboarded, complete: completeOnboarding } = useOnboarding();
  const replaying = useOnboardingStore(s => s.replaying);
  const endReplay = useOnboardingStore(s => s.endReplay);
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

  // Pending deep-link navigation (Share-to-Vidrip paste, or a reaxn://reaction link).
  // A link can arrive before the NavigationContainer mounts (cold start shows a
  // loading spinner first), so navRef may be null on a timer. Instead run whenever a
  // pending item exists AND the container is ready: from this effect (warm start /
  // session just loaded) and from the container's onReady (cold start).
  const pendingShareUrl = useShareIntentStore(s => s.pendingUrl);
  const pendingReactionId = useShareIntentStore(s => s.pendingReactionId);
  const pendingChannel = useShareIntentStore(s => s.pendingChannel);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Second-factor gate: a user with a verified authenticator signs in at AAL1 and
  // must pass the TOTP challenge to reach AAL2. Keyed on user id (NOT the whole
  // session) so routine token refreshes don't re-trigger a spinner. No factor →
  // nextLevel stays aal1 → this is a no-op, so non-enrolled users are unaffected.
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaChecked, setMfaChecked] = useState(false);
  const recheckMfa = useCallback(async () => {
    if (!sessionRef.current) { setMfaRequired(false); setMfaChecked(true); return; }
    let required = false;
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      required = !error && data?.currentLevel === 'aal1' && data?.nextLevel === 'aal2';
    } catch { required = false; } // never hard-lock the app on an AAL read error
    setMfaRequired(required);
    setMfaChecked(true);
  }, []);
  useEffect(() => {
    setMfaChecked(false);
    recheckMfa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);
  const runPendingNavigation = useCallback(() => {
    if (!sessionRef.current || !navRef.current?.isReady()) { return; }
    const store = useShareIntentStore.getState();
    if (store.pendingChannel) {
      const { id, justSubscribed } = store.pendingChannel;
      store.setPendingChannel(null);
      // Coming back from the channel should land on My Subscriptions.
      if (justSubscribed) { store.setSubscribedTabPending(true); }
      navRef.current.navigate('Main', {
        screen: 'Channels',
        params: { screen: 'Channel', params: { channelId: id, channelName: '', isPublic: true, isJoined: true, isMembersOnly: true, justSubscribed } },
      });
    } else if (store.pendingReactionId) {
      const reactionId = store.pendingReactionId;
      store.setPendingReactionId(null);
      navRef.current.navigate('Main', {
        screen: 'Feed', params: { screen: 'WatchReaction', params: { reactionId } },
      });
    } else if (store.pendingUrl) {
      // ShareHomeScreen reads pendingUrl from the store and fills it in once focused.
      navRef.current.navigate('Main', { screen: 'Share', params: { screen: 'ShareHome' } });
    }
  }, []);
  useEffect(() => { runPendingNavigation(); }, [pendingShareUrl, pendingReactionId, pendingChannel, session, runPendingNavigation]);

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

    // OS "Share to Vidrip" (Android ACTION_SEND rewritten to reaxn://share, or the
    // iOS Share Extension) → pull the link out and stash it. The navigation to the
    // Share tab is driven by the effect below, once the navigator + session are
    // actually ready (on a cold start the link arrives before they mount).
    if (url.startsWith('reaxn://share')) {
      const query = url.split('?')[1] ?? '';
      const text = new URLSearchParams(query).get('text');
      if (text) {
        // Shared text may be "Check this out https://…"; grab the URL if present.
        const link = text.match(/https?:\/\/\S+/)?.[0] ?? text;
        useShareIntentStore.getState().setPendingUrl(link);
      }
      return;
    }

    // reaxn://reaction/<id> — a shared Vidrip reaction link → open that reaction.
    if (url.startsWith('reaxn://reaction/')) {
      const id = url.slice('reaxn://reaction/'.length).split(/[?#/]/)[0];
      if (id) { useShareIntentStore.getState().setPendingReactionId(id); }
      return;
    }

    // reaxn://channel/<id>?subscribed=1 — returning from the web subscribe flow.
    // Stash it; runPendingNavigation opens it once the navigator + session are
    // ready (handles cold start, where the link arrives before they mount).
    if (url.startsWith('reaxn://channel/')) {
      const id = url.slice('reaxn://channel/'.length).split(/[?#/]/)[0];
      const justSubscribed = /[?&]subscribed=1/.test(url);
      if (id) { useShareIntentStore.getState().setPendingChannel({ id, justSubscribed }); }
      return;
    }

    // OAuth account-sync redirect → hand to AccountScreen to run the sync.
    const oauth = parseOAuthDeepLink(url);
    if (oauth) { useOAuthStore.getState().setPending(oauth); return; }

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

  // Wait for the onboarding flag and the MFA check to load too, so signed-in users
  // don't flash the app before the second-factor gate.
  if (isLoading || (session && !onbReady) || (session && !mfaChecked)) {
    return (
      <View style={{ flex: 1, backgroundColor: C.BG_SOLID, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.ACCENT} />
      </View>
    );
  }

  // Signed in but second factor outstanding → block on the TOTP challenge.
  if (session && mfaRequired) {
    return <MfaChallengeScreen onVerified={recheckMfa} />;
  }

  const showOnboarding = !!session && (!onboarded || replaying);

  return (
    <NavigationContainer ref={navRef} theme={navTheme} onReady={runPendingNavigation}>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          showOnboarding ? (
            <Root.Screen name="Onboarding">
              {() => (
                <ScreenGradient>
                  <OnboardingScreen
                    mode={onboarded ? 'replay' : 'firstRun'}
                    onDone={() => { if (!onboarded) { completeOnboarding(); } endReplay(); }}
                  />
                </ScreenGradient>
              )}
            </Root.Screen>
          ) : (
            <>
              <Root.Screen name="Main" component={MainTabs} />
              <Root.Screen
                name="Studio"
                component={StudioStack}
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
              />
              <Root.Screen
                name="RecordReaction"
                component={RecordReactionScreen}
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
              />
              <Root.Screen
                name="RecordComment"
                component={RecordCommentScreen}
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
              />
              <Root.Screen
                name="RecordIntro"
                component={RecordIntroScreen}
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
              />
            </>
          )
        ) : (
          <Root.Screen name="Auth" component={AuthStack} />
        )}
      </Root.Navigator>
    </NavigationContainer>
  );
}
