import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { storage } from '../utils/storage';
import { pushApi } from '../api/client';

// Only import native notification modules on non-web platforms
const isWeb = Platform.OS === 'web';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Notifications = isWeb ? null : require('expo-notifications');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Device = isWeb ? null : require('expo-device');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Constants = isWeb ? null : require('expo-constants').default;

// Configure how notifications appear while app is in foreground (native only)
if (!isWeb) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Register for push notifications and upload the Expo push token to the server.
 * Also handles notification tap → navigation.
 *
 * Returns the FCM/Expo token string (or null if not available).
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (isWeb) return null; // Push notifications not supported on web

  if (!Device.isDevice) {
    console.log('[Push] Push notifications only work on physical devices');
    return null;
  }

  // Android: create a notification channel for messages
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#075E54',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission not granted');
    return null;
  }

  // Get the Expo push token (works on both iOS and Android with FCM under the hood)
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn('[Push] No EAS projectId in app.json — push token unavailable in development');
    // In bare workflow / standalone: use getDevicePushTokenAsync for raw FCM token
    try {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      const token = deviceToken.data as string;
      await pushApi.subscribe(token, Platform.OS === 'ios' ? 'ios' : 'android');
      await storage.setItem('fcmToken', token);
      return token;
    } catch (err) {
      console.error('[Push] getDevicePushTokenAsync failed:', err);
      return null;
    }
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await pushApi.subscribe(token, 'expo');
    await storage.setItem('fcmToken', token);
    return token;
  } catch (err) {
    console.error('[Push] getExpoPushTokenAsync failed:', err);
    return null;
  }
}

interface PushNotificationHookOptions {
  onNotificationTap?: (data: Record<string, string>) => void;
}

export function usePushNotifications({ onNotificationTap }: PushNotificationHookOptions = {}) {
  const responseListenerRef = useRef<any>(null);

  useEffect(() => {
    if (isWeb) return; // No push notifications on web

    // Handle tap on a notification (opens app from background/killed state)
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response.notification.request.content.data as Record<string, string>;
      onNotificationTap?.(data);
    });

    return () => {
      if (responseListenerRef.current) {
        Notifications.removeNotificationSubscription(responseListenerRef.current);
      }
    };
  }, [onNotificationTap]);
}
