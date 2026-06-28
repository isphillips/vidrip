import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Linking, View } from 'react-native';
import { navigationRef } from './navigationRef';
import { C } from '../../theme';
import { supabase } from '../../infrastructure/supabase/client';
import { useAuthStore } from '../../store/authStore';
import { useBlockStore } from '../../store/blockStore';
import { useOAuthStore } from '../../store/oauthStore';
import { useShareIntentStore } from '../../store/shareIntentStore';
import { parseOAuthDeepLink } from '../../infrastructure/oauth/config';
import { ensureReactionsDir } from '../../infrastructure/storage/localReactionStorage';
import {
  bootstrapNotifications,
  registerPushToken,
  unregisterPushToken,
  setNotificationOpenedHandler,
  setChannelNotificationHandler,
  setAwardNotificationHandler,
} from '../../infrastructure/notifications/pushService';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import ProfileDrawer from '../../components/ProfileDrawer';
import FriendsMenuOverlay from '../../components/FriendsMenuOverlay';
import ProfileReactionPlayer from '../../components/ProfileReactionPlayer';
import MfaChallengeScreen from '../../features/auth/screens/MfaChallengeScreen';
import RecordReactionScreen from '../../features/record/screens/RecordReactionScreen';
import RecordCommentScreen from '../../features/comments/screens/RecordCommentScreen';
import RecordIntroScreen from '../../features/share/screens/RecordIntroScreen';
import FriendRequestsScreen from '../../features/friends/screens/FriendRequestsScreen';
import AddFriendScreen from '../../features/friends/screens/AddFriendScreen';
import InviteContactsScreen from '../../features/friends/screens/InviteContactsScreen';
import InviteManagementScreen from '../../features/friends/screens/InviteManagementScreen';
import FriendsHomeScreen from '../../features/friends/screens/FriendsHomeScreen';
import UserProfileScreen from '../../features/friends/screens/UserProfileScreen';
import CreateGroupChatScreen from '../../features/channels/screens/CreateGroupChatScreen';
import OnboardingScreen from '../../features/onboarding/OnboardingScreen';
import CreatorOnboardingScreen from '../../features/onboarding/creator/CreatorOnboardingScreen';
import { CREATOR_INTRO } from '../../features/onboarding/config';
import ScreenGradient from '../../components/ScreenGradient';
import SplashScene from '../../components/splash/SplashScene';
import { useOnboarding, useOnboardingStore } from '../../features/onboarding/onboarding';
import type { RootStackParamList } from './types';

const Root = createNativeStackNavigator<RootStackParamList>();

// The "Friend list" root modal is a tiny stack so tapping a friend can push their Profile WITHIN the
// modal (back to the list), while the list itself shows a close-X. Its other actions (add friend,
// import contacts, invite codes) bubble out to their own root modals.
const FriendsModal = createNativeStackNavigator();
function FriendListModal() {
  return (
    <FriendsModal.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.BG_SOLID } }}>
      <FriendsModal.Screen name="List" component={FriendsHomeScreen as any} />
      <FriendsModal.Screen
        name="Profile"
        component={UserProfileScreen as any}
        options={{ headerShown: true, title: 'Profile', headerTintColor: C.INK, headerStyle: { backgroundColor: C.BG_SOLID } }}
      />
    </FriendsModal.Navigator>
  );
}

// Dark purple base so cold-start / any uncovered area matches the app gradient
// (instead of the default white/black flash).
const navTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.BG_SOLID } };

export default function RootNavigator() {
  const { session, isLoading, setSession, setProfile, setLoading } = useAuthStore();
  const { ready: onbReady, seen: onboarded, complete: completeOnboarding } = useOnboarding();
  const replaying = useOnboardingStore(s => s.replaying);
  const endReplay = useOnboardingStore(s => s.endReplay);
  // Shared navigation ref (also drives FriendsMenuOverlay, which lives outside any screen).
  const navRef = navigationRef;
  // The animated launch scene stays mounted on top until it dissolves itself (once the app is ready).
  const [splashGone, setSplashGone] = useState(false);
  // Closed-launch creator intro: a signed-out visitor gets the cinematic creator pitch instead of the
  // login wall (CREATOR_INTRO). Tapping its "log in" link forces the auth flow for this session.
  const [authForced, setAuthForced] = useState(false);

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

    // Wire award notification tap → open the gift reveal in the Feed tab.
    setAwardNotificationHandler((awardId: string) => {
      navRef.current?.navigate('Main', {
        screen: 'Feed',
        params: { screen: 'GiftReveal', params: { awardId } },
      });
    });

    const cleanup = bootstrapNotifications();
    return cleanup;
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      // Capture the outgoing user id BEFORE setSession nulls it, so a sign-out can
      // unregister this device's push token (otherwise a signed-out device keeps
      // receiving the previous user's notifications).
      const prevUserId = useAuthStore.getState().user?.id;
      setSession(s);
      setTimeout(async () => {
        try {
          if (s?.user) {
            await fetchProfile(s.user.id);
            // Register for push notifications on sign-in
            registerPushToken(s.user.id).catch(() => {});
          } else {
            // Clear the push token on sign-out so this device stops receiving the
            // signed-out user's notifications.
            if (prevUserId) { unregisterPushToken(prevUserId).catch(() => {}); }
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

  // Pending deep-link navigation (Share-to-Vidrip paste, or a vidrip://reaction link).
  // A link can arrive before the NavigationContainer mounts (cold start shows a
  // loading spinner first), so navRef may be null on a timer. Instead run whenever a
  // pending item exists AND the container is ready: from this effect (warm start /
  // session just loaded) and from the container's onReady (cold start).
  const pendingShareUrl = useShareIntentStore(s => s.pendingUrl);
  const pendingReactionId = useShareIntentStore(s => s.pendingReactionId);
  const pendingChannel = useShareIntentStore(s => s.pendingChannel);
  const pendingChannelReact = useShareIntentStore(s => s.pendingChannelReact);
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

  // Load the app-wide block list once per signed-in user (drives mutual hiding everywhere).
  useEffect(() => {
    const uid = session?.user?.id;
    if (uid) { useBlockStore.getState().load(uid); }
  }, [session?.user?.id]);
  const runPendingNavigation = useCallback(() => {
    if (!sessionRef.current || !navRef.current?.isReady()) { return; }
    const store = useShareIntentStore.getState();
    if (store.pendingChannelReact) {
      // From the web channel page's "Record Your Reaction in App" CTA → open the recorder.
      const { channelId, postId } = store.pendingChannelReact;
      store.setPendingChannelReact(null);
      navRef.current.navigate('Main', {
        screen: 'Channels',
        params: { screen: 'WatchYouTubePost', params: { postId, channelId } },
      });
    } else if (store.pendingChannel) {
      const { id } = store.pendingChannel;
      store.setPendingChannel(null);
      navRef.current.navigate('Main', {
        screen: 'Channels',
        params: { screen: 'Channel', params: { channelId: id, channelName: '', isPublic: true, isJoined: true, isMembersOnly: true } },
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
  useEffect(() => { runPendingNavigation(); }, [pendingShareUrl, pendingReactionId, pendingChannel, pendingChannelReact, session, runPendingNavigation]);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) { setProfile(data); }
  };

  const handleDeepLink = async (url: string) => {
    if (!url.startsWith('vidrip://')) { return; }

    // OS "Share to Vidrip" (Android ACTION_SEND rewritten to vidrip://share, or the
    // iOS Share Extension) → pull the link out and stash it. The navigation to the
    // Share tab is driven by the effect below, once the navigator + session are
    // actually ready (on a cold start the link arrives before they mount).
    if (url.startsWith('vidrip://share')) {
      const query = url.split('?')[1] ?? '';
      const text = new URLSearchParams(query).get('text');
      if (text) {
        // Shared text may be "Check this out https://…"; grab the URL if present.
        const link = text.match(/https?:\/\/\S+/)?.[0] ?? text;
        useShareIntentStore.getState().setPendingUrl(link);
      }
      return;
    }

    // vidrip://reaction/<id> — a shared Vidrip reaction link → open that reaction.
    if (url.startsWith('vidrip://reaction/')) {
      const id = url.slice('vidrip://reaction/'.length).split(/[?#/]/)[0];
      if (id) { useShareIntentStore.getState().setPendingReactionId(id); }
      return;
    }

    // vidrip://channels/<channelId>/react/<postId> — the web channel page's "Record Your
    // Reaction in App" CTA → open the in-app reaction recorder for that post.
    if (url.startsWith('vidrip://channels/')) {
      const m = url.slice('vidrip://channels/'.length).match(/^([^/]+)\/react\/([^/?#]+)/);
      if (m) { useShareIntentStore.getState().setPendingChannelReact({ channelId: m[1], postId: m[2] }); }
      return;
    }

    // vidrip://invite?code=<CODE> — web registration hand-off → prefill the invite-code entry.
    if (url.startsWith('vidrip://invite')) {
      const code = new URLSearchParams(url.split('?')[1] ?? '').get('code');
      if (code) { useShareIntentStore.getState().setPendingInviteCode(code); }
      return;
    }

    // vidrip://channel/<id> — open the room. Stash it; runPendingNavigation opens it once the
    // navigator + session are ready (handles cold start, where the link arrives before they mount).
    if (url.startsWith('vidrip://channel/')) {
      const id = url.slice('vidrip://channel/'.length).split(/[?#/]/)[0];
      if (id) { useShareIntentStore.getState().setPendingChannel({ id }); }
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
  // don't flash the app before the second-factor gate. The animated launch scene
  // (SplashScene) covers the app until everything below is ready, then dissolves itself.
  const appReady = !(isLoading || (session && !onbReady) || (session && !mfaChecked));
  const showOnboarding = !!session && (!onboarded || replaying);

  let content: React.ReactNode;
  if (!appReady) {
    // Bare backdrop (matches navTheme + the splash sky) — the splash overlays it until ready.
    content = <View style={{ flex: 1, backgroundColor: C.BG_SOLID }} />;
  } else if (session && mfaRequired) {
    // Signed in but second factor outstanding → block on the TOTP challenge.
    content = <MfaChallengeScreen onVerified={recheckMfa} />;
  } else {
    content = (
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
              {/* Studio is now a bottom-nav tab (see MainTabs), not a root modal drawer. */}
              {/* Full-screen camera recorders: force a BLACK modal backdrop so the app's
                  purple navTheme background (C.BG_SOLID) never peeks through where the
                  recorder/source-video letterbox doesn't reach the bottom edge. */}
              {/* Friends experience — dismissable modals (close button, no back) reachable from every
                  tab header via the FriendsMenu. */}
              <Root.Screen
                name="FriendRequests"
                component={FriendRequestsScreen}
                options={{ presentation: 'modal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: C.BG_SOLID } }}
              />
              <Root.Screen
                name="FriendList"
                component={FriendListModal}
                // Swipe-to-dismiss stays ON; FriendsHomeScreen temporarily disables it (via
                // getParent().setOptions) only while a finger is on the A–Z rail, so dragging the
                // rail can't accidentally close the modal.
                options={{ presentation: 'modal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: C.BG_SOLID } }}
              />
              <Root.Screen
                name="FindFriend"
                component={AddFriendScreen as any}
                options={{ presentation: 'modal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: C.BG_SOLID } }}
              />
              <Root.Screen
                name="ImportContacts"
                component={InviteContactsScreen as any}
                options={{ presentation: 'modal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: C.BG_SOLID } }}
              />
              <Root.Screen
                name="InviteCodes"
                component={InviteManagementScreen as any}
                options={{ presentation: 'modal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: C.BG_SOLID } }}
              />
              <Root.Screen
                name="CreateGroupChat"
                component={CreateGroupChatScreen as any}
                options={{ presentation: 'modal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: C.BG_SOLID } }}
              />
              <Root.Screen
                name="RecordReaction"
                component={RecordReactionScreen}
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: '#000' } }}
              />
              <Root.Screen
                name="RecordComment"
                component={RecordCommentScreen}
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: '#000' } }}
              />
              <Root.Screen
                name="RecordIntro"
                component={RecordIntroScreen}
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: '#000' } }}
              />
            </>
          )
        ) : CREATOR_INTRO && !authForced ? (
          // Closed-launch: serve the cinematic creator pitch instead of the login wall.
          // Its "log in" link sets authForced → swaps to the Auth flow for this session.
          <Root.Screen name="CreatorIntro">
            {() => <CreatorOnboardingScreen onLogin={() => setAuthForced(true)} />}
          </Root.Screen>
        ) : (
          <Root.Screen name="Auth" component={AuthStack} />
        )}
      </Root.Navigator>
      {/* Global profile drawer — overlays everything; opened from any @handle tap. */}
      {session && <ProfileDrawer />}
      {/* Full-screen player for reactions opened from a profile drawer. */}
      {session && <ProfileReactionPlayer />}
      {/* Global friends menu (the header drip-blob dropdown) — overlays everything, no RN Modal. */}
      {session && <FriendsMenuOverlay />}
      </NavigationContainer>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.BG_SOLID }}>
      {content}
      {!splashGone && <SplashScene ready={appReady} onHidden={() => setSplashGone(true)} />}
    </View>
  );
}
