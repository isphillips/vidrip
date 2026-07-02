import { log } from '../logging/logger';
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
// Notifee (Android only): FCM auto-displays a banner only when the app is BACKGROUNDED. To show one
// while the app is FOREGROUNDED (like iOS does), we display it ourselves from onMessage via Notifee.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let notifee: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let AndroidImportance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let EventType: any = null;
// The foreground banner reuses the same look as FCM's backgrounded banner (see AndroidManifest
// default_notification_icon / color).
const ANDROID_CHANNEL_ID = 'default';
const NOTIF_ICON = 'ic_notification';
const NOTIF_COLOR = '#E73D93';
if (Platform.OS === 'android') {
  const { getApp } = require('@react-native-firebase/app');
  messaging = require('@react-native-firebase/messaging');
  const notifeeMod = require('@notifee/react-native');
  notifee = notifeeMod.default;
  AndroidImportance = notifeeMod.AndroidImportance;
  EventType = notifeeMod.EventType;
  const app = getApp();
  messagingInstance = messaging.getMessaging(app);
  // A placeholder google-services.json can never obtain a real FCM token, so Android push silently
  // fails while iOS (APNs, separate credentials) keeps working. Surface it loudly at startup.
  if (app?.options?.projectId === 'vidrip-placeholder') {
    log.error('[Push] google-services.json is a PLACEHOLDER (projectId=vidrip-placeholder). '
      + 'Replace android/app/google-services.json with the real Firebase config (same project as the '
      + "server's FCM_SERVICE_ACCOUNT) or Android push will never arrive.");
  }
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
    log.error('[Push] token save error:', JSON.stringify(error));
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
    if (Number(Platform.Version) >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        log.warn('[Push] Android notification permission denied');
        return;
      }
    }

    try {
      const token = await messaging.getToken(messagingInstance);
      if (token) {
        await saveToken(userId, token, 'android');
      } else {
        log.warn('[Push] Android FCM getToken returned empty — no token saved');
      }
    } catch (e) {
      // Most commonly a bad/placeholder google-services.json or an FCM project mismatch. Log instead of
      // letting the caller's .catch swallow it silently (which is why this was invisible before).
      log.error('[Push] Android FCM getToken failed (check google-services.json / Firebase project):', JSON.stringify(e));
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

// reactionId (when present) opens that reaction directly; postId opens the specific channel post.
type ThreadNotificationHandler = (threadId: string, reactionId?: string) => void;
type ChannelNotificationHandler = (channelId: string, channelName: string, postId?: string) => void;
type AwardNotificationHandler = (awardId: string) => void;

let _onNotificationOpened: ThreadNotificationHandler | null = null;
let _onChannelNotification: ChannelNotificationHandler | null = null;
let _onAwardNotification: AwardNotificationHandler | null = null;

export function setNotificationOpenedHandler(handler: ThreadNotificationHandler): void {
  _onNotificationOpened = handler;
}

export function setChannelNotificationHandler(handler: ChannelNotificationHandler): void {
  _onChannelNotification = handler;
}

export function setAwardNotificationHandler(handler: AwardNotificationHandler): void {
  _onAwardNotification = handler;
}

// Route a notification's data payload (shared between iOS/Android). Award > channel > thread.
function route(data: { type?: string; award_id?: string; channel_id?: string; channel_name?: string; post_id?: string; thread_id?: string; reaction_id?: string } | undefined): void {
  if (!data) { return; }
  if (data.type === 'award' && data.award_id && _onAwardNotification) {
    _onAwardNotification(data.award_id);
  } else if (data.channel_id && _onChannelNotification) {
    // Forward post_id so a "reacted to your channel post" tap opens that POST, not just the channel.
    _onChannelNotification(data.channel_id, data.channel_name ?? 'Channel', data.post_id);
  } else if (data.thread_id && _onNotificationOpened) {
    // Forward reaction_id so a "reacted to your video" tap can open that reaction directly.
    _onNotificationOpened(data.thread_id, data.reaction_id);
  }
}

function handleIOSNotification(notification: PushNotification): void {
  route(notification.getData());
  notification.finish(PushNotificationIOS.FetchResult.NoData);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleAndroidNotification(remoteMessage: any): void {
  route(remoteMessage?.data);
}

// Public wrapper so index.js's Notifee BACKGROUND-event handler can route a tapped foreground banner.
export function routeNotificationData(data: Record<string, string> | undefined): void {
  route(data as any);
}

// Android foreground banner: FCM doesn't auto-display while the app is open, so we display it via
// Notifee (same icon/color as the backgrounded banner). The routing `data` rides along so a tap routes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function displayForegroundBanner(remoteMessage: any): Promise<void> {
  if (!notifee || !remoteMessage?.notification) { return; }   // data-only messages need no banner
  // Ensure the channel exists (idempotent) — guards the race where a push lands before bootstrap's
  // createChannel resolves; displayNotification requires an existing channel on Android.
  await notifee.createChannel({
    id: ANDROID_CHANNEL_ID, name: 'General', importance: AndroidImportance.HIGH, sound: 'default',
  });
  await notifee.displayNotification({
    title: remoteMessage.notification.title,
    body: remoteMessage.notification.body,
    data: remoteMessage.data ?? {},
    android: {
      channelId: ANDROID_CHANNEL_ID,
      smallIcon: NOTIF_ICON,
      color: NOTIF_COLOR,
      pressAction: { id: 'default' },   // tap opens the app and emits a PRESS event
    },
  });
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
      log.error('[Push] registration error:', JSON.stringify(err));
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
    // The channel a foreground banner is posted to (idempotent — safe to (re)create at each boot).
    notifee.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'General',
      importance: AndroidImportance.HIGH,   // heads-up banner while the app is open
      sound: 'default',
    }).catch((e: any) => log.warn('[Push] notifee createChannel failed:', JSON.stringify(e)));

    // Foreground messages: FCM stays silent while the app is open, so DISPLAY the banner ourselves via
    // Notifee (don't navigate — navigating on arrival used to yank the user to the target with no banner).
    // A tap on this banner routes via the Notifee foreground/background press events below.
    const unsubForeground = messaging.onMessage(messagingInstance, (remoteMessage: any) => {
      displayForegroundBanner(remoteMessage).catch((e) => log.warn('[Push] foreground banner failed:', JSON.stringify(e)));
    });

    // Tap on a Notifee-displayed (foreground) banner while the app is still open.
    const unsubNotifeeForeground = notifee.onForegroundEvent(({ type, detail }: any) => {
      if (type === EventType.PRESS) { route(detail?.notification?.data); }
    });

    // Tap on an FCM-displayed (backgrounded) banner → route to the target screen.
    messaging.onNotificationOpenedApp(messagingInstance, handleAndroidNotification);

    // App opened from quit state — check BOTH sources: FCM (backgrounded banner) + Notifee (a
    // foreground banner the user backgrounded, then the app was killed, then reopened via tap).
    messaging.getInitialNotification(messagingInstance).then((remoteMessage: any) => {
      if (remoteMessage) { handleAndroidNotification(remoteMessage); }
    });
    notifee.getInitialNotification().then((initial: any) => {
      if (initial?.notification?.data) { route(initial.notification.data); }
    }).catch(() => {});

    // FCM token refresh
    const unsubTokenRefresh = messaging.onTokenRefresh(messagingInstance, async (token: string) => {
      if (_pendingUserId) {
        await saveToken(_pendingUserId, token, 'android');
      }
    });

    return () => {
      unsubForeground();
      unsubNotifeeForeground();
      unsubTokenRefresh();
    };
  }

  return () => {};
}
