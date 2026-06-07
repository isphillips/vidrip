import { Platform, AppState, PermissionsAndroid } from 'react-native';
import { supabase } from '../supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PushNotificationIOS: any = null;
if (Platform.OS === 'ios') {
  PushNotificationIOS = require('@react-native-community/push-notification-ios').default;
}

// Firebase Cloud Messaging — Android only (iOS uses APNs via PushNotificationIOS).
// Modular API (RN Firebase v22+): call free functions with a messaging instance
// rather than the deprecated namespaced `messaging().method()` form.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let messaging: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let messagingInstance: any = null;
if (Platform.OS === 'android') {
  const { getApp } = require('@react-native-firebase/app');
  messaging = require('@react-native-firebase/messaging');
  messagingInstance = messaging.getMessaging(getApp());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PushNotification = any;

// ── Token management ─────────────────────────────────────────────────────────

let _pendingUserId: string | null = null;

async function saveToken(userId: string, token: string, platform: 'ios' | 'android') {
  const { error } = await (supabase as any)
    .from('device_tokens')
    .upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      // Key on (user_id, platform) so a user can have both an iOS and an Android
      // device registered at once (needs the matching unique constraint in DB).
      { onConflict: 'user_id,platform' },
    );
  if (error) {
    console.error('[Push] token save error:', JSON.stringify(error));
  }
}

export async function registerPushToken(userId: string): Promise<void> {
  _pendingUserId = userId;

  if (Platform.OS === 'ios') {
    await PushNotificationIOS.requestPermissions({
      alert: true,
      badge: true,
      sound: true,
    });
    // Token is delivered via the 'register' event listener set up in bootstrapNotifications
    return;
  }

  if (Platform.OS === 'android') {
    // Android 13+ requires explicit runtime permission
    if (parseInt(Platform.Version as string, 10) >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.warn('[Push] Android notification permission denied');
        return;
      }
    }

    const token = await messaging.getToken(messagingInstance);
    if (token) {
      await saveToken(userId, token, 'android');
    }
  }
}

export async function unregisterPushToken(userId: string): Promise<void> {
  _pendingUserId = null;
  await (supabase as any).from('device_tokens').delete().eq('user_id', userId);
}

export function clearBadge(): void {
  if (Platform.OS === 'ios') {
    PushNotificationIOS.setApplicationIconBadgeNumber(0);
  }
}

// ── Notification routing ─────────────────────────────────────────────────────

type ThreadNotificationHandler = (threadId: string) => void;
type ChannelNotificationHandler = (channelId: string, channelName: string) => void;

let _onNotificationOpened: ThreadNotificationHandler | null = null;
let _onChannelNotification: ChannelNotificationHandler | null = null;

export function setNotificationOpenedHandler(handler: ThreadNotificationHandler): void {
  _onNotificationOpened = handler;
}

export function setChannelNotificationHandler(handler: ChannelNotificationHandler): void {
  _onChannelNotification = handler;
}

function handleIOSNotification(notification: PushNotification): void {
  const data = notification.getData() as {
    thread_id?: string;
    channel_id?: string;
    channel_name?: string;
  };

  if (data?.channel_id && _onChannelNotification) {
    _onChannelNotification(data.channel_id, data.channel_name ?? 'Channel');
  } else if (data?.thread_id && _onNotificationOpened) {
    _onNotificationOpened(data.thread_id);
  }

  notification.finish(PushNotificationIOS.FetchResult.NoData);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleAndroidNotification(remoteMessage: any): void {
  const data = remoteMessage?.data as {
    thread_id?: string;
    channel_id?: string;
    channel_name?: string;
  } | undefined;

  if (data?.channel_id && _onChannelNotification) {
    _onChannelNotification(data.channel_id, data.channel_name ?? 'Channel');
  } else if (data?.thread_id && _onNotificationOpened) {
    _onNotificationOpened(data.thread_id);
  }
}

// ── Bootstrap — call once at app startup ─────────────────────────────────────

export function bootstrapNotifications(): () => void {
  if (Platform.OS === 'ios') {
    PushNotificationIOS.addEventListener('register', async (token: string) => {
      if (_pendingUserId) {
        await saveToken(_pendingUserId, token, 'ios');
      }
    });

    PushNotificationIOS.addEventListener('registrationError', (err: any) => {
      console.error('[Push] registration error:', JSON.stringify(err));
    });

    PushNotificationIOS.addEventListener('localNotification', handleIOSNotification);
    PushNotificationIOS.addEventListener('notification', handleIOSNotification);

    PushNotificationIOS.getInitialNotification().then((notification: PushNotification) => {
      if (notification) { handleIOSNotification(notification); }
    });

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { clearBadge(); }
    });

    return () => {
      PushNotificationIOS.removeEventListener('register');
      PushNotificationIOS.removeEventListener('registrationError');
      PushNotificationIOS.removeEventListener('localNotification');
      PushNotificationIOS.removeEventListener('notification');
      sub.remove();
    };
  }

  if (Platform.OS === 'android') {
    // Foreground messages
    const unsubForeground = messaging.onMessage(messagingInstance, handleAndroidNotification);

    // Background/quit tap → app opened
    messaging.onNotificationOpenedApp(messagingInstance, handleAndroidNotification);

    // App opened from quit state
    messaging.getInitialNotification(messagingInstance).then((remoteMessage: any) => {
      if (remoteMessage) { handleAndroidNotification(remoteMessage); }
    });

    // FCM token refresh
    const unsubTokenRefresh = messaging.onTokenRefresh(messagingInstance, async (token: string) => {
      if (_pendingUserId) {
        await saveToken(_pendingUserId, token, 'android');
      }
    });

    return () => {
      unsubForeground();
      unsubTokenRefresh();
    };
  }

  return () => {};
}
