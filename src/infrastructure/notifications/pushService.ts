import { Platform, AppState } from 'react-native';
import PushNotificationIOS, {
  type PushNotification,
} from '@react-native-community/push-notification-ios';
import { supabase } from '../supabase/client';

// ── Token management ─────────────────────────────────────────────────────────

let _pendingUserId: string | null = null;

async function saveToken(userId: string, token: string) {
  const { error } = await (supabase as any)
    .from('device_tokens')
    .upsert(
      { user_id: userId, token, platform: 'ios', updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) {
    console.error('[Push] token save error:', JSON.stringify(error));
  } else {
    console.log('[Push] token saved for user', userId);
  }
}

export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS !== 'ios') { return; }

  _pendingUserId = userId;

  await PushNotificationIOS.requestPermissions({
    alert: true,
    badge: true,
    sound: true,
  });

}

export async function unregisterPushToken(userId: string): Promise<void> {
  _pendingUserId = null;
  await (supabase as any).from('device_tokens').delete().eq('user_id', userId);
}

export function clearBadge(): void {
  PushNotificationIOS.setApplicationIconBadgeNumber(0);
}

// ── Notification routing ─────────────────────────────────────────────────────

type NotificationHandler = (threadId: string) => void;
let _onNotificationOpened: NotificationHandler | null = null;

export function setNotificationOpenedHandler(handler: NotificationHandler): void {
  _onNotificationOpened = handler;
}

function handleNotification(notification: PushNotification): void {
  const data = notification.getData() as { thread_id?: string };
  if (data?.thread_id && _onNotificationOpened) {
    _onNotificationOpened(data.thread_id);
  }
  notification.finish(PushNotificationIOS.FetchResult.NoData);
}

// ── Bootstrap — call once at app startup ─────────────────────────────────────

export function bootstrapNotifications(): () => void {
  // 'register' listener must be set up before requestPermissions is called
  // so the token is never missed regardless of timing
  PushNotificationIOS.addEventListener('register', async (token: string) => {
    console.log('[Push] received APNs token:', token);
    if (_pendingUserId) {
      await saveToken(_pendingUserId, token);
    }
  });

  PushNotificationIOS.addEventListener('registrationError', (err: any) => {
    console.error('[Push] registration error:', JSON.stringify(err));
  });

  PushNotificationIOS.addEventListener('localNotification', handleNotification);
  PushNotificationIOS.addEventListener('notification', handleNotification);

  PushNotificationIOS.getInitialNotification().then((notification) => {
    if (notification) { handleNotification(notification); }
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
